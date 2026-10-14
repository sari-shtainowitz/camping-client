import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import { useAuth } from '../auth'
import type { PagedResult, ReservationResponse, Tent } from '../types'
import { RESERVATION_STATUS_CANCELLED, TENT_TYPES, TENT_TYPES_HE } from '../types'
import { readStayRange, writeStayRange } from '../lib/stayDates'
import { CHECKOUT_MINUTES } from './CheckoutPage'
import type { CheckoutState } from './CheckoutPage'
import { EmberTrail } from '../components/EmberTrail'

// Tents per page - small on purpose so the server-side paging is visible.
const PAGE_SIZE = 3

// Customer-friendly price bands, sent to the server as the existing
// minPricePerNight / maxPricePerNight query filters (both inclusive).
const PRICE_BANDS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: 'all', label: 'כל המחירים' },
  { id: 'to50', label: 'עד ₪50', max: 50 },
  { id: '50to100', label: '₪51–₪100', min: 50.01, max: 100 },
  { id: '100to150', label: '₪101–₪150', min: 100.01, max: 150 },
  { id: 'from150', label: 'מעל ₪150', min: 150.01 },
]

// "How many guests" choices (TentQueryParameters.MinCapacity on the server).
const PEOPLE_OPTIONS = [1, 2, 3, 4, 5, 6]

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nightsBetween(start: string, end: string): number {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

// dd/mm/yyyy from an ISO "yyyy-mm-dd" (no timezone maths - the API sends date-only).
function fmt(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// Same rule the server enforces in ReservationService.EnsureTentIsFreeAsync:
// a non-cancelled reservation whose range overlaps [start, end) blocks the tent.
function findConflict(
  reservations: ReservationResponse[],
  start: string,
  end: string,
): ReservationResponse | null {
  return (
    reservations.find(
      (r) =>
        r.status !== RESERVATION_STATUS_CANCELLED && start < r.endDate && r.startDate < end,
    ) ?? null
  )
}

// The tent list with real server-side pagination and real availability (computed
// from GET /api/reservations). Choosing a tent does NOT book it: it opens the
// checkout page with a 15-minute payment window, and the reservation is sent to
// the server only after the (mock) payment is approved there.
export function TentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Same role check as App.tsx. Admins browse the full catalogue with no
  // capacity filter (the other filters are unchanged for everyone).
  const isAdmin = user?.role === 'Admin'

  // Arriving from the campsite map: /tents?tent=<id> focuses one tent so the
  // customer can pick dates and continue to payment here.
  const [searchParams] = useSearchParams()
  const focusParam = searchParams.get('tent')
  const focusTentId = focusParam && /^\d+$/.test(focusParam) ? Number(focusParam) : null

  const [data, setData] = useState<PagedResult<Tent> | null>(null)
  const [reservationsByTent, setReservationsByTent] = useState<Record<number, ReservationResponse[]>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [dates, setDates] = useState(readStayRange)
  const [openTentId, setOpenTentId] = useState<number | null>(null)

  // Catalogue filters - all applied by the server (TentQueryParameters).
  const [minPeople, setMinPeople] = useState(0) // 0 = any
  const [typeFilter, setTypeFilter] = useState<number | null>(null) // null = any
  const [priceBand, setPriceBand] = useState('all')
  const [page, setPage] = useState(1)
  const filtersActive =
    (!isAdmin && minPeople > 0) || typeFilter !== null || priceBand !== 'all'

  // Any filter change starts again from the first page.
  function changeFilter(apply: () => void) {
    apply()
    setPage(1)
  }

  function clearFilters() {
    changeFilter(() => {
      setMinPeople(0)
      setTypeFilter(null)
      setPriceBand('all')
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Real server-side paging and filtering: page, pageSize and the filters go
      // to the server, which runs them in the database (Skip/Take + WHERE).
      // When focused on one tent (from the map) we fetch just that tent instead.
      let tents: PagedResult<Tent>
      if (focusTentId != null) {
        const one = await api<Tent>(`/tents/${focusTentId}`)
        tents = {
          items: [one],
          page: 1,
          pageSize: 1,
          totalCount: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }
      } else {
        const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
        if (typeFilter !== null) query.set('type', String(typeFilter))
        if (!isAdmin && minPeople > 0) query.set('minCapacity', String(minPeople))
        const band = PRICE_BANDS.find((b) => b.id === priceBand)
        if (band?.min !== undefined) query.set('minPricePerNight', String(band.min))
        if (band?.max !== undefined) query.set('maxPricePerNight', String(band.max))
        tents = await api<PagedResult<Tent>>(`/tents?${query}`)
      }
      setData(tents)

      // Availability: one request for the reservations, grouped by tent here
      // (not one request per tent).
      const byTent: Record<number, ReservationResponse[]> = {}
      try {
        const r = await api<PagedResult<ReservationResponse>>('/reservations?pageSize=100')
        for (const res of r.items) (byTent[res.tentId] ??= []).push(res)
      } catch {
        /* availability just shows as free; the server still guards every booking */
      }
      setReservationsByTent(byTent)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.detail : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [focusTentId, page, typeFilter, minPeople, priceBand, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  // Open the booking panel for the tent chosen on the map.
  useEffect(() => {
    if (focusTentId != null) setOpenTentId(focusTentId)
  }, [focusTentId])

  // Remember the selected range so the campsite map checks the same dates.
  useEffect(() => {
    writeStayRange(dates)
  }, [dates])

  // An Admin has no "כמות אנשים" filter - drop any leftover selection so it can
  // never narrow the list (the filter logic also ignores it while isAdmin).
  useEffect(() => {
    if (isAdmin && minPeople !== 0) setMinPeople(0)
  }, [isAdmin, minPeople])

  function toggleBooking(tentId: number) {
    setOpenTentId((current) => (current === tentId ? null : tentId))
  }

  // Nothing is sent to the server here - the hold lives only in the checkout
  // page's router state, so abandoning it never takes the tent.
  function goToCheckout(tentId: number) {
    const state: CheckoutState = {
      tentId,
      start: dates.start,
      end: dates.end,
      expiresAt: Date.now() + CHECKOUT_MINUTES * 60_000,
    }
    navigate('/checkout', { state })
  }

  const today = isoDate(new Date())
  const nights = nightsBetween(dates.start, dates.end)
  const datesValid = nights > 0
  const refreshing = loading && data !== null

  // The server already filtered and paged - this is exactly one page.
  const shownTents = data?.items ?? []
  const totalCount = data?.totalCount ?? 0

  const availableCount = datesValid
    ? shownTents.filter(
        (t) => t.isActive && !findConflict(reservationsByTent[t.id] ?? [], dates.start, dates.end),
      ).length
    : 0

  return (
    <div className="page">
      <EmberTrail />
      {focusTentId != null && (
        <Link to="/tents" className="btn btn--ghost btn--sm backlink">
          → חזרה לכל האוהלים
        </Link>
      )}

      <div className="page-head">
        <h1 className="page-head__title">אוהלים</h1>
        <p className="page-head__sub">
          {focusTentId != null
            ? 'בחרו תאריכים ואשרו את ההזמנה לאוהל שנבחר.'
            : 'בחרו תאריכים, ראו מה פנוי, והזמינו את המקום שלכם.'}
        </p>
      </div>

      <div className="card daterange">
        <span className="daterange__label">מתי תרצו להגיע?</span>
        <div className="daterange__fields">
          <label className="field">
            <span>צ׳ק-אין</span>
            <input
              type="date"
              value={dates.start}
              min={today}
              onChange={(e) => {
                setDates((d) => ({ ...d, start: e.target.value }))
              }}
            />
          </label>
          <label className="field">
            <span>צ׳ק-אאוט</span>
            <input
              type="date"
              value={dates.end}
              min={dates.start || today}
              onChange={(e) => {
                setDates((d) => ({ ...d, end: e.target.value }))
              }}
            />
          </label>
        </div>
        <span className={datesValid ? 'daterange__nights' : 'daterange__nights daterange__nights--bad'}>
          {datesValid ? `${nights} לילות` : 'טווח תאריכים לא תקין'}
        </span>
      </div>

      {focusTentId == null && (
        <div className="card filters">
          <div className="filters__row">
            {!isAdmin && (
              <label className="field">
                <span>כמות אנשים</span>
                <select
                  value={minPeople}
                  onChange={(e) => changeFilter(() => setMinPeople(Number(e.target.value)))}
                >
                  <option value={0}>הכול</option>
                  {PEOPLE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'אורח' : 'אורחים'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field">
              <span>למי מיועד</span>
              <select
                value={typeFilter ?? ''}
                onChange={(e) =>
                  changeFilter(() =>
                    setTypeFilter(e.target.value === '' ? null : Number(e.target.value)),
                  )
                }
              >
                <option value="">הכול</option>
                {TENT_TYPES_HE.map((he, i) => (
                  <option key={he} value={i}>
                    {he}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>מחיר ללילה</span>
              <select
                value={priceBand}
                onChange={(e) => changeFilter(() => setPriceBand(e.target.value))}
              >
                {PRICE_BANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn btn--ghost btn--sm filters__clear"
              disabled={!filtersActive}
              onClick={clearFilters}
            >
              ניקוי סינון
            </button>
          </div>

          <p className="filters__summary">
            {!data ? (
              'טוען אוהלים…'
            ) : (
              <>
                <strong>{totalCount}</strong> {filtersActive ? 'אוהלים מתאימים' : 'אוהלים'}
                {datesValid && shownTents.length > 0 && (
                  <> · {availableCount} פנויים בעמוד הזה לתאריכים שנבחרו</>
                )}
              </>
            )}
            {refreshing && (
              <>
                {'  '}
                <span className="updating">
                  <span className="spinner" aria-hidden="true" /> מעדכן
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {loadError && (
        <p className="banner banner--error page__alert" role="alert">
          {loadError}
        </p>
      )}

      <div className={refreshing ? 'tent-grid is-busy' : 'tent-grid'}>
        {!data && loading &&
          Array.from({ length: focusTentId != null ? 1 : 6 }, (_, i) => (
            <div key={i} className="skeleton-card" />
          ))}

        {data && shownTents.length === 0 && (
          <p className="notice">
            {!filtersActive
              ? 'אין אוהלים זמינים כרגע.'
              : 'לא נמצאו אוהלים שמתאימים לסינון. נסו לשנות את הבחירה או ללחוץ על "ניקוי סינון".'}
          </p>
        )}

        {shownTents.map((tent) => (
          <TentCard
            key={tent.id}
            tent={tent}
            nights={nights}
            datesValid={datesValid}
            dates={dates}
            conflict={
              tent.isActive
                ? findConflict(reservationsByTent[tent.id] ?? [], dates.start, dates.end)
                : null
            }
            open={openTentId === tent.id}
            onToggle={() => toggleBooking(tent.id)}
            onCheckout={() => goToCheckout(tent.id)}
          />
        ))}
      </div>

      {/* Server-side pagination: each page is a new GET /api/tents?page=N request. */}
      {focusTentId == null && data && data.totalPages > 1 && (
        <nav className="pager" aria-label="עמודים">
          <span className="pager__info">
            עמוד <strong>{data.page}</strong> מתוך <strong>{data.totalPages}</strong>
          </span>
          <div className="pager__nav">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!data.hasPreviousPage || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              → הקודם
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!data.hasNextPage || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              הבא ←
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}

// Small decorative night scene at the top of each card. The tent's shape follows
// its type; hovering the card lights the tent, starts a little campfire and
// (for glamping) switches on the string lights - all done in CSS.
function TentScene({ type }: { type: string }) {
  return (
    <div className={`tent-scene tent-scene--${type}`} aria-hidden="true">
      <svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMax slice">
        <g className="ts-stars" fill="#fffbe8">
          <circle cx="30" cy="20" r="1.3" />
          <circle cx="78" cy="38" r="1" />
          <circle cx="120" cy="14" r="1.5" />
          <circle cx="182" cy="30" r="1" />
          <circle cx="214" cy="12" r="1.2" />
          <circle cx="262" cy="40" r="1" />
          <circle cx="150" cy="44" r="0.9" />
        </g>
        <circle className="ts-moon" cx="248" cy="24" r="9" fill="#fff6de" />
        <path d="M0 92 C 50 76, 90 84, 140 80 S 230 70, 300 84 L300 110 L0 110Z" fill="#0d1d15" />
        <path d="M0 100 C 60 94, 120 98, 170 96 S 260 92, 300 98 L300 110 L0 110Z" fill="#08130d" />
        <g className="ts-pine" fill="#08130d">
          <polygon points="34,98 46,66 58,98" />
          <polygon points="256,98 266,72 276,98" />
        </g>

        {type === 'glamping' ? (
          <g transform="translate(150 98)"><g className="ts-tent">
            <path d="M-46 0 Q -44 -40 0 -54 Q 44 -40 46 0 Z" fill="#2f4c3b" />
            <path className="ts-door" d="M-12 0 Q -12 -26 0 -32 Q 12 -26 12 0 Z" fill="#2a1d12" />
            <line x1="0" y1="-54" x2="0" y2="-64" stroke="#6f5a43" strokeWidth="2" />
            <path d="M-80 -30 Q -40 -18 0 -50 Q 40 -18 80 -30" fill="none" stroke="#3b3a35" strokeWidth="1" />
            <g className="ts-bulbs" fill="#ffd27a">
              <circle cx="-64" cy="-26" r="2" />
              <circle cx="-44" cy="-24" r="2" />
              <circle cx="-22" cy="-34" r="2" />
              <circle cx="22" cy="-34" r="2" />
              <circle cx="44" cy="-24" r="2" />
              <circle cx="64" cy="-26" r="2" />
            </g>
          </g></g>
        ) : type === 'family' ? (
          <g transform="translate(150 98)"><g className="ts-tent">
            <polygon points="-58,0 -30,-46 30,-46 58,0" fill="#2f4c3b" />
            <polygon points="-30,-46 30,-46 0,-52" fill="#3c6049" />
            <polygon className="ts-door" points="-14,0 0,-38 14,0" fill="#2a1d12" />
          </g></g>
        ) : (
          <g transform="translate(150 98)"><g className="ts-tent">
            <polygon points="-40,0 0,-48 40,0" fill="#2f4c3b" />
            <polygon className="ts-door" points="-12,0 0,-30 12,0" fill="#2a1d12" />
          </g></g>
        )}

        <g transform="translate(214 98)"><g className="ts-fire">
          <rect x="-9" y="-3" width="18" height="4" rx="2" fill="#5a3b22" transform="rotate(10)" />
          <rect x="-9" y="-3" width="18" height="4" rx="2" fill="#6b4529" transform="rotate(-10)" />
          <path className="ts-flame" d="M0 -20 C 7 -11, 8 -4, 0 1 C -8 -4, -7 -11, 0 -20 Z" fill="#ff7a2a" />
          <path className="ts-flame ts-flame--core" d="M0 -11 C 3 -6, 4 -2, 0 0 C -4 -2, -3 -6, 0 -11 Z" fill="#ffe08a" />
        </g></g>
      </svg>
    </div>
  )
}

type TentCardProps = {
  tent: Tent
  nights: number
  datesValid: boolean
  dates: { start: string; end: string }
  conflict: ReservationResponse | null
  open: boolean
  onToggle: () => void
  onCheckout: () => void
}

function TentCard({
  tent,
  nights,
  datesValid,
  dates,
  conflict,
  open,
  onToggle,
  onCheckout,
}: TentCardProps) {
  const typeKey = (TENT_TYPES[tent.type] ?? 'Standard').toLowerCase()
  const typeHe = TENT_TYPES_HE[tent.type] ?? TENT_TYPES_HE[0]
  const canBook = tent.isActive && datesValid && !conflict
  const estimate = nights > 0 ? nights * tent.pricePerNight : 0

  let availKind: 'free' | 'taken' | 'off' | 'unknown'
  let availText: string
  if (!tent.isActive) {
    availKind = 'off'
    availText = 'האוהל אינו זמין להזמנה'
  } else if (!datesValid) {
    availKind = 'unknown'
    availText = 'בחרו תאריכים כדי לבדוק זמינות'
  } else if (conflict) {
    availKind = 'taken'
    availText = `תפוס בתאריכים שנבחרו (${fmt(conflict.startDate)}–${fmt(conflict.endDate)})`
  } else {
    availKind = 'free'
    availText = 'פנוי לתאריכים שנבחרו'
  }

  return (
    <article
      className={`tent-card tent-card--${typeKey}${tent.isActive ? '' : ' tent-card--inactive'}`}
    >
      <TentScene type={typeKey} />
      <div className="tent-card__body">
        <div className="tent-card__top">
          <span className="tent-card__label">{tent.label}</span>
          <span className={`badge badge--${typeKey}`}>{typeHe}</span>
        </div>

        <div className="tent-card__meta">
          <span className="meta__k">תפוסה</span>
          <span className="meta__price">
            <b>₪{tent.pricePerNight.toFixed(0)}</b>
            <span>ללילה</span>
          </span>
          <span className="meta__v">
            עד {tent.capacity} {tent.capacity === 1 ? 'אורח' : 'אורחים'}
          </span>
        </div>

        <span className={`avail avail--${availKind}`}>
          {(availKind === 'free' || availKind === 'taken') && (
            <span className={availKind === 'free' ? 'status-dot status-dot--on' : 'status-dot status-dot--taken'} />
          )}
          {availText}
        </span>

        <div className="tent-card__foot">
          <button
            className={open ? 'btn btn--ghost btn--block' : 'btn btn--primary btn--block'}
            disabled={!canBook && !open}
            onClick={onToggle}
          >
            {open ? 'סגירה' : conflict ? 'בחרו תאריכים אחרים' : 'הזמן אוהל'}
          </button>
        </div>
      </div>

      {open && (
        <div className="tent-card__booking">
          <p className="booking__summary">
            אוהל <strong>{tent.label}</strong> · {fmt(dates.start)}–{fmt(dates.end)} · {nights} לילות
            {' · '}
            <strong>₪{estimate.toFixed(0)}</strong> (משוער)
          </p>

          <div className="booking__actions">
            <button className="btn btn--primary" disabled={!canBook} onClick={onCheckout}>
              המשך לתשלום
            </button>
          </div>
          <p className="booking__note">
            יש {CHECKOUT_MINUTES} דקות להשלמת התשלום. האוהל ייתפס רק לאחר שהתשלום יאושר.
          </p>
        </div>
      )}
    </article>
  )
}
