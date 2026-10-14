import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../api'
import { useAuth } from '../auth'
import type { CampSite, PagedResult, ReservationResponse, Tent } from '../types'
import {
  RESERVATION_STATUS_CANCELLED,
  RESERVATION_STATUS_HE,
  RESERVATION_STATUS_KEY,
  TENT_TYPES_HE,
} from '../types'
import { ConfirmationDocument } from '../pdf/ConfirmationDocument'
import type { ConfirmationData } from '../pdf/ConfirmationDocument'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmt(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function nights(start: string, end: string): number {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// The signed-in customer's own reservations. Read-only: reservations are created
// on the booking page. Reuses the existing PDF confirmation component.
export function MyReservationsPage() {
  const { user } = useAuth()

  const [rows, setRows] = useState<ReservationResponse[] | null>(null)
  const [tentsById, setTentsById] = useState<Record<number, Tent>>({})
  const [site, setSite] = useState<CampSite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null)
  const [pdfData, setPdfData] = useState<ConfirmationData | null>(null)
  const confRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [reservations, tents] = await Promise.all([
        api<PagedResult<ReservationResponse>>(
          `/reservations?userId=${Number(user.id)}&pageSize=100`,
        ),
        api<PagedResult<Tent>>('/tents?pageSize=100'),
      ])
      setTentsById(Object.fromEntries(tents.items.map((t) => [t.id, t])))
      const sorted = [...reservations.items].sort((a, b) =>
        a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.id - a.id,
      )
      setRows(sorted)
      try {
        const sites = await api<PagedResult<CampSite>>('/camping-sites?pageSize=100')
        setSite(sites.items[0] ?? null)
      } catch {
        /* the PDF just omits the site line */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  // Once the off-screen confirmation document is mounted, rasterise it to a PDF.
  useEffect(() => {
    if (!pdfData) return
    let cancelled = false
    void (async () => {
      try {
        const { generateConfirmationPdf } = await import('../pdf/generate')
        if (!cancelled && confRef.current) {
          await generateConfirmationPdf(confRef.current, pdfData.reservation.id)
        }
      } catch (e) {
        if (!cancelled) setError(`יצירת ה-PDF נכשלה: ${(e as Error).message}`)
      } finally {
        if (!cancelled) {
          setPdfBusyId(null)
          setPdfData(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfData])

  function downloadPdf(r: ReservationResponse) {
    const tent = tentsById[r.tentId]
    if (!tent || !user) return
    setPdfBusyId(r.id)
    setPdfData({
      reservation: r,
      tent,
      site,
      guestName: user.fullName,
      guestEmail: user.email,
    })
  }

  const today = todayIso()
  const upcoming = rows
    ? rows.filter((r) => r.status !== RESERVATION_STATUS_CANCELLED && r.endDate >= today).length
    : 0

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-head__title">ההזמנות שלי</h1>
        <p className="page-head__sub">כל ההזמנות שביצעת במחנה.</p>
      </div>

      {error && (
        <p className="banner banner--error page__alert" role="alert">
          {error}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="schedule-summary">
          <span>סה״כ הזמנות: <strong>{rows.length}</strong></span>
          <span>קרובות / פעילות: <strong>{upcoming}</strong></span>
        </div>
      )}

      {rows && rows.length === 0 && !loading ? (
        <div className="notice">
          עדיין אין לך הזמנות.{' '}
          <Link to="/tents">לעיון באוהלים והזמנה</Link>
        </div>
      ) : (
        <div className="card" style={{ padding: '4px 18px' }}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>אוהל</th>
                  <th>סוג</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>לילות</th>
                  <th>סטטוס</th>
                  <th>סה״כ</th>
                  <th>אישור</th>
                </tr>
              </thead>
              <tbody>
                {loading && !rows && (
                  <tr>
                    <td colSpan={8} className="muted">טוען…</td>
                  </tr>
                )}
                {rows?.map((r) => {
                  const tent = tentsById[r.tentId]
                  const active = r.status !== RESERVATION_STATUS_CANCELLED && r.endDate >= today
                  const statusKey = RESERVATION_STATUS_KEY[r.status] ?? 'pending'
                  const statusHe = RESERVATION_STATUS_HE[r.status] ?? String(r.status)
                  return (
                    <tr key={r.id} className={active ? 'admin-table__row--now' : undefined}>
                      <td><strong>{tent?.label ?? `#${r.tentId}`}</strong></td>
                      <td>{tent ? TENT_TYPES_HE[tent.type] ?? TENT_TYPES_HE[0] : '—'}</td>
                      <td className="admin-table__num">{fmt(r.startDate)}</td>
                      <td className="admin-table__num">{fmt(r.endDate)}</td>
                      <td className="admin-table__num">{nights(r.startDate, r.endDate)}</td>
                      <td>
                        <span className={`pill pill--${statusKey}`}>{statusHe}</span>
                      </td>
                      <td className="admin-table__num">₪{r.totalPrice.toFixed(0)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={!tent || pdfBusyId !== null}
                          onClick={() => downloadPdf(r)}
                        >
                          {pdfBusyId === r.id ? 'מכין…' : 'PDF'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Off-screen source for the PDF confirmation. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 0 }}>
        {pdfData && <ConfirmationDocument ref={confRef} data={pdfData} />}
      </div>
    </div>
  )
}
