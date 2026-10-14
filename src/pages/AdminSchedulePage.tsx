import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { AdminUser, PagedResult, ReservationResponse, Tent } from '../types'
import {
  RESERVATION_STATUS_CANCELLED,
  RESERVATION_STATUS_HE,
  RESERVATION_STATUS_KEY,
} from '../types'

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

// Read-only reservation schedule for Admin. Composed from existing endpoints:
// GET /api/reservations, /api/tents and /api/users. No create/update here.
export function AdminSchedulePage() {
  const [rows, setRows] = useState<ReservationResponse[] | null>(null)
  const [tentLabels, setTentLabels] = useState<Record<number, string>>({})
  const [userNames, setUserNames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const [reservations, tents, users] = await Promise.all([
          api<PagedResult<ReservationResponse>>('/reservations?pageSize=100&sortBy=startDate'),
          api<PagedResult<Tent>>('/tents?pageSize=100'),
          api<PagedResult<AdminUser>>('/users?pageSize=100'),
        ])
        if (cancelled) return
        setTentLabels(Object.fromEntries(tents.items.map((t) => [t.id, t.label])))
        setUserNames(Object.fromEntries(users.items.map((u) => [u.id, u.fullName])))
        const sorted = [...reservations.items].sort((a, b) =>
          a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id - b.id,
        )
        setRows(sorted)
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.detail : (e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const today = todayIso()
  const isOccupiedNow = (r: ReservationResponse) =>
    r.status !== RESERVATION_STATUS_CANCELLED && r.startDate <= today && today < r.endDate
  const isUpcoming = (r: ReservationResponse) =>
    r.status !== RESERVATION_STATUS_CANCELLED && r.startDate > today

  const occupiedTents = rows ? new Set(rows.filter(isOccupiedNow).map((r) => r.tentId)).size : 0
  const upcoming = rows ? rows.filter(isUpcoming).length : 0

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-head__title">לוח הזמנות</h1>
        <p className="page-head__sub">כל ההזמנות במערכת. תצוגה בלבד — לא ניתן ליצור הזמנה מכאן.</p>
      </div>

      {error && (
        <p className="banner banner--error page__alert" role="alert">
          {error}
        </p>
      )}

      {rows && (
        <div className="schedule-summary">
          <span>מאוכלסים כעת: <strong>{occupiedTents}</strong> אוהלים</span>
          <span>הזמנות עתידיות: <strong>{upcoming}</strong></span>
          <span>סה״כ הזמנות: <strong>{rows.length}</strong></span>
        </div>
      )}

      <div className="card" style={{ padding: '4px 18px' }}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>אוהל</th>
                <th>אורח/ת</th>
                <th>הגעה</th>
                <th>עזיבה</th>
                <th>לילות</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows && (
                <tr><td colSpan={6} className="muted">טוען…</td></tr>
              )}
              {rows && rows.length === 0 && (
                <tr><td colSpan={6} className="muted">אין הזמנות.</td></tr>
              )}
              {rows?.map((r) => {
                const occupied = isOccupiedNow(r)
                const statusKey = RESERVATION_STATUS_KEY[r.status] ?? 'pending'
                const statusHe = RESERVATION_STATUS_HE[r.status] ?? String(r.status)
                return (
                  <tr key={r.id} className={occupied ? 'admin-table__row--now' : undefined}>
                    <td><strong>{tentLabels[r.tentId] ?? `#${r.tentId}`}</strong></td>
                    <td>{userNames[r.userId] ?? `#${r.userId}`}</td>
                    <td className="admin-table__num">{fmt(r.startDate)}</td>
                    <td className="admin-table__num">{fmt(r.endDate)}</td>
                    <td className="admin-table__num">{nights(r.startDate, r.endDate)}</td>
                    <td>
                      <span className={`pill pill--${statusKey}`}>{statusHe}</span>
                      {occupied && <span className="pill pill--now" style={{ marginInlineStart: 6 }}>עכשיו</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
