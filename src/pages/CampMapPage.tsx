import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { CampSite, PagedResult, Tent } from '../types'
import { TENT_TYPES_HE } from '../types'
import { readStayRange, writeStayRange } from '../lib/stayDates'
import { fetchOccupancyByTent, findBooking } from '../lib/occupancy'
import type { TentBooking } from '../lib/occupancy'

type Status = 'free' | 'reserved' | 'off'

// ---- date helpers (date-only, no timezone maths - mirrors TentsPage) ---------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nightsBetween(start: string, end: string): number {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

function fmt(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// ---- deterministic top-down placement of a tent on the map -------------------
// The backend has no coordinates, so positions are derived from the tent id:
// stable across reloads, organic-looking, and kept clear of the lake corner.

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function jitter(id: number, axis: string, amp: number): number {
  return ((hash(`${id}:${axis}`) % 1000) / 1000 - 0.5) * 2 * amp
}

function tentPos(index: number, total: number, id: number): { x: number; y: number } {
  const perRow = Math.min(3, Math.max(1, total))
  const rows = Math.max(1, Math.ceil(total / perRow))
  const col = index % perRow
  const row = Math.floor(index / perRow)
  const zoneX0 = 12
  const zoneX1 = 60
  const zoneY0 = 24
  const zoneY1 = 84
  const cw = (zoneX1 - zoneX0) / perRow
  const ch = (zoneY1 - zoneY0) / rows
  const x = zoneX0 + cw * (col + 0.5) + jitter(id, 'x', Math.min(4, cw * 0.22))
  const y = zoneY0 + ch * (row + 0.5) + jitter(id, 'y', Math.min(5, ch * 0.22))
  return { x: Math.min(92, Math.max(6, x)), y: Math.min(92, Math.max(8, y)) }
}

// ---- decorative scene ------------------------------------------------------

const TREES = [
  { x: 24, y: 30, s: 1 },
  { x: 70, y: 150, s: 1.25 },
  { x: 120, y: 40, s: 0.85 },
  { x: 300, y: 175, s: 1.15 },
  { x: 355, y: 120, s: 0.9 },
  { x: 175, y: 205, s: 1 },
  { x: 30, y: 120, s: 1.1 },
  { x: 250, y: 25, s: 0.8 },
]

// Night-time version of the campsite: moonlit grass, a dark lake with the moon's
// reflection, a glowing campfire and pines. Purely decorative.
function MapScene() {
  return (
    <svg
      className="campmap__scene"
      viewBox="0 0 400 250"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3a2a" />
          <stop offset="1" stopColor="#11251a" />
        </linearGradient>
        <radialGradient id="water" cx="0.45" cy="0.4" r="0.75">
          <stop offset="0" stopColor="#2b5a78" />
          <stop offset="1" stopColor="#14304a" />
        </radialGradient>
        <radialGradient id="moonlight" cx="0.85" cy="0.1" r="0.8">
          <stop offset="0" stopColor="#c9dcff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#c9dcff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="campfire">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#ff7a2a" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ff7a2a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="250" fill="url(#grass)" />
      <rect width="400" height="250" fill="url(#moonlight)" />

      {/* lake in the top-right corner, with the moon reflected in it */}
      <ellipse cx="345" cy="55" rx="115" ry="72" fill="url(#water)" />
      <ellipse cx="345" cy="55" rx="115" ry="72" fill="none" stroke="#9cc4e6" strokeWidth="1.5" opacity="0.35" />
      <ellipse cx="330" cy="48" rx="13" ry="13" fill="#fff6de" opacity="0.85" />
      <g fill="#fff1c9" className="campmap__ripples">
        <rect x="312" y="68" width="36" height="1.6" rx="0.8" opacity="0.5" />
        <rect x="318" y="76" width="24" height="1.4" rx="0.7" opacity="0.4" />
        <rect x="308" y="84" width="44" height="1.2" rx="0.6" opacity="0.25" />
      </g>
      <path d="M262 96 l16 -7 4 9 z" fill="#6f5a43" />

      {/* winding path */}
      <path
        d="M-10 235 C 70 215, 110 165, 190 150 S 300 120, 360 70"
        fill="none"
        stroke="#5b5442"
        strokeWidth="15"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* campfire near the pitches */}
      <g transform="translate(150 120)">
        <circle cx="0" cy="0" r="46" fill="url(#campfire)" className="campmap__fireglow" />
        <ellipse cx="0" cy="6" rx="12" ry="4" fill="#3b2a1a" opacity="0.8" />
        <path className="campmap__flame" d="M0 -10 C 6 -2, 6 4, 0 8 C -6 4, -6 -2, 0 -10 Z" fill="#ff7a2a" />
        <path className="campmap__flame" d="M0 -4 C 3 0, 3 3, 0 6 C -3 3, -3 0, 0 -4 Z" fill="#ffe08a" />
      </g>

      {TREES.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
          <rect x="-2" y="6" width="4" height="9" rx="1" fill="#2a1f14" />
          <polygon points="0,-17 11,4 -11,4" fill="#0e2418" />
          <polygon points="0,-7 13,12 -13,12" fill="#133020" />
        </g>
      ))}
    </svg>
  )
}

function TentGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4 22 21H2Z" fill="currentColor" />
      <path d="M12 11 17 21H7Z" fill="rgba(255,255,255,0.85)" />
    </svg>
  )
}

// ---- page -----------------------------------------------------------------
// Display-only: the campsite layout, tent locations, tent details and
// availability for a chosen date range. Booking is NOT done here - an available
// tent links to the existing booking page (/tents) with that tent pre-selected.

export function CampMapPage() {
  const [dates, setDates] = useState(readStayRange)
  const [tents, setTents] = useState<Tent[] | null>(null)
  const [bookingsByTent, setBookingsByTent] = useState<Record<number, TentBooking[]>>({})
  const [site, setSite] = useState<CampSite | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setLoadError(null)
      try {
        const tentPage = await api<PagedResult<Tent>>('/tents?pageSize=100')
        if (cancelled) return
        setTents(tentPage.items)
        try {
          const sites = await api<PagedResult<CampSite>>('/camping-sites?pageSize=100')
          if (!cancelled) setSite(sites.items[0] ?? null)
        } catch {
          /* header just omits the site name */
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.detail : (e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the selected range in sync with the booking page.
  useEffect(() => {
    writeStayRange(dates)
  }, [dates])

  // Every tent's booked dates for the selected range, whoever booked them - so a
  // tent another guest took shows as taken here too. Re-run when the dates change.
  useEffect(() => {
    if (!(dates.start && dates.end && dates.start < dates.end)) {
      setBookingsByTent({})
      return
    }
    let cancelled = false
    fetchOccupancyByTent(dates.start, dates.end)
      .then((byTent) => {
        if (!cancelled) setBookingsByTent(byTent)
      })
      .catch(() => {
        /* tents just show as free; the server still guards every booking */
      })
    return () => {
      cancelled = true
    }
  }, [dates.start, dates.end])

  const today = isoDate(new Date())
  const nights = nightsBetween(dates.start, dates.end)
  const datesValid = nights > 0

  // Availability for the selected range only: a tent is unavailable when any
  // guest's booking overlaps [start, end). Bookings outside it don't count.
  function conflictOf(tent: Tent): TentBooking | null {
    if (!datesValid) return null
    return findBooking(bookingsByTent[tent.id] ?? [], dates.start, dates.end)
  }

  function statusOf(tent: Tent): Status {
    if (!tent.isActive) return 'off'
    return conflictOf(tent) ? 'reserved' : 'free'
  }

  const placed = useMemo(() => {
    const list = [...(tents ?? [])].sort((a, b) => a.id - b.id)
    return list.map((tent, i) => ({ tent, ...tentPos(i, list.length, tent.id) }))
  }, [tents])

  const selected = selectedId != null ? (tents ?? []).find((t) => t.id === selectedId) ?? null : null
  const selectedStatus = selected ? statusOf(selected) : null
  const selectedConflict = selected ? conflictOf(selected) : null
  const freeCount = (tents ?? []).filter((t) => statusOf(t) === 'free').length

  const statusLabel = (s: Status): string =>
    s === 'off' ? 'לא זמין להזמנה' : s === 'reserved' ? 'תפוס בטווח שנבחר' : 'פנוי'

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-head__title">מפת המתחם</h1>
        <p className="page-head__sub">
          {site ? `${site.name} — ` : ''}מבט-על על המתחם. בחרו תאריכים כדי לבדוק זמינות, ולחצו על אוהל לפרטים.
        </p>
      </div>

      <div className="card daterange">
        <span className="daterange__label">בדיקת זמינות</span>
        <div className="daterange__fields">
          <label className="field">
            <span>צ׳ק-אין</span>
            <input
              type="date"
              value={dates.start}
              min={today}
              onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>צ׳ק-אאוט</span>
            <input
              type="date"
              value={dates.end}
              min={dates.start || today}
              onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))}
            />
          </label>
        </div>
        <span className={datesValid ? 'daterange__nights' : 'daterange__nights daterange__nights--bad'}>
          {datesValid ? `${nights} לילות` : 'טווח תאריכים לא תקין'}
        </span>
      </div>

      {loadError && (
        <p className="banner banner--error page__alert" role="alert">
          {loadError}
        </p>
      )}

      <div className="toolbar">
        <span className="toolbar__summary">
          {tents ? (
            datesValid ? (
              <>
                <strong>{freeCount}</strong> מתוך <strong>{tents.length}</strong> אוהלים פנויים לטווח שנבחר
              </>
            ) : (
              <>בחרו טווח תאריכים תקין כדי לראות זמינות</>
            )
          ) : (
            'טוען מפה…'
          )}
        </span>
        {loading && tents && (
          <span className="updating">
            <span className="spinner" aria-hidden="true" /> מעדכן
          </span>
        )}
      </div>

      <div className="campmap" onClick={() => setSelectedId(null)} role="group" aria-label="מפת אוהלים">
        <MapScene />
        {placed.map(({ tent, x, y }) => {
          const status = statusOf(tent)
          return (
            <button
              key={tent.id}
              type="button"
              className={`campmap__tent is-${status}${selectedId === tent.id ? ' is-selected' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`אוהל ${tent.label} — ${statusLabel(status)}`}
              aria-pressed={selectedId === tent.id}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedId((current) => (current === tent.id ? null : tent.id))
              }}
            >
              <TentGlyph />
              <span className="campmap__tent-label">{tent.label}</span>
            </button>
          )
        })}
      </div>

      <div className="map-legend">
        <span><i className="free" /> פנוי</span>
        <span><i className="reserved" /> תפוס בטווח שנבחר</span>
        <span><i className="off" /> לא זמין להזמנה</span>
      </div>

      {selected && selectedStatus && (
        <div className="card map-panel">
          <div className="map-panel__head">
            <span className="map-panel__title">אוהל {selected.label}</span>
            <span
              className={`pill pill--${
                selectedStatus === 'free' ? 'confirmed' : selectedStatus === 'reserved' ? 'pending' : 'off'
              }`}
            >
              {statusLabel(selectedStatus)}
            </span>
          </div>

          <dl className="tent-facts">
            <div>
              <dt>שם / מספר</dt>
              <dd>{selected.label}</dd>
            </div>
            <div>
              <dt>סוג</dt>
              <dd>{TENT_TYPES_HE[selected.type] ?? TENT_TYPES_HE[0]}</dd>
            </div>
            <div>
              <dt>תפוסה</dt>
              <dd>
                עד {selected.capacity} {selected.capacity === 1 ? 'אורח' : 'אורחים'}
              </dd>
            </div>
            <div>
              <dt>מחיר ללילה</dt>
              <dd>₪{selected.pricePerNight.toFixed(0)}</dd>
            </div>
            <div>
              <dt>זמינות</dt>
              <dd>{datesValid ? statusLabel(selectedStatus) : 'בחרו טווח תאריכים'}</dd>
            </div>
          </dl>

          {selectedStatus === 'off' ? (
            <p className="banner banner--warn">האוהל אינו זמין להזמנה.</p>
          ) : selectedStatus === 'reserved' ? (
            <p className="banner banner--warn">
              האוהל תפוס בטווח שנבחר
              {selectedConflict
                ? ` (${fmt(selectedConflict.startDate)}–${fmt(selectedConflict.endDate)})`
                : ''}
              . בחרו תאריכים אחרים או אוהל אחר.
            </p>
          ) : (
            <Link className="btn btn--primary" to={`/tents?tent=${selected.id}`}>
              המשך להזמנה
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
