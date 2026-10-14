import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { CampSite, PagedResult, ReservationResponse, Tent } from '../types'
import { RESERVATION_STATUS_CANCELLED, TENT_TYPES, TENT_TYPES_HE } from '../types'

type Msg = { kind: 'ok' | 'error'; text: string }

// Mirrors Camping.API/DTOs/Requests/TentRequest.
type TentInput = {
  campingSiteId: number
  label: string
  type: number
  capacity: number
  pricePerNight: number
  isActive: boolean
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmt(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// A tent is "booked" if it has any non-cancelled reservation that has not ended
// yet. The backend blocks deleting a tent that has ANY reservation row
// (FK is Restrict); disabling here on the booked case keeps the UI honest and
// the API stays the real guard.
function activeReservation(
  reservations: ReservationResponse[],
  today: string,
): ReservationResponse | null {
  return (
    reservations.find(
      (r) => r.status !== RESERVATION_STATUS_CANCELLED && r.endDate >= today,
    ) ?? null
  )
}

export function AdminTentsPage() {
  const [data, setData] = useState<PagedResult<Tent> | null>(null)
  const [reservationsByTent, setReservationsByTent] = useState<Record<number, ReservationResponse[]>>({})
  const [site, setSite] = useState<CampSite | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      // Admin sees the whole (single-site) catalogue in one go - no pagination.
      const tents = await api<PagedResult<Tent>>('/tents?page=1&pageSize=100')
      setData(tents)

      const sites = await api<PagedResult<CampSite>>('/camping-sites?pageSize=100')
      setSite(sites.items[0] ?? null)

      const reservations = await api<PagedResult<ReservationResponse>>('/reservations?pageSize=100')
      const byTent: Record<number, ReservationResponse[]> = {}
      for (const r of reservations.items) {
        ;(byTent[r.tentId] ??= []).push(r)
      }
      setReservationsByTent(byTent)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.detail : (e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function errText(e: unknown): string {
    return e instanceof ApiError ? e.detail : (e as Error).message
  }

  async function createTent(input: TentInput) {
    setBusy(true)
    setMsg(null)
    try {
      const created = await api<Tent>('/tents', { method: 'POST', body: JSON.stringify(input) })
      setAdding(false)
      setMsg({ kind: 'ok', text: `האוהל "${created.label}" נוסף.` })
      await load()
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function updateTent(id: number, input: TentInput) {
    setBusy(true)
    setMsg(null)
    try {
      const updated = await api<Tent>(`/tents/${id}`, { method: 'PUT', body: JSON.stringify(input) })
      setEditingId(null)
      setMsg({ kind: 'ok', text: `האוהל "${updated.label}" עודכן.` })
      await load()
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteTent(tent: Tent) {
    if (!window.confirm(`למחוק את האוהל "${tent.label}"? הפעולה אינה הפיכה.`)) return
    setBusy(true)
    setMsg(null)
    try {
      await api(`/tents/${tent.id}`, { method: 'DELETE' })
      setMsg({ kind: 'ok', text: `האוהל "${tent.label}" נמחק.` })
      if (editingId === tent.id) setEditingId(null)
      await load()
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const today = todayIso()
  const editingTent = editingId != null ? data?.items.find((t) => t.id === editingId) ?? null : null

  return (
    <div className="page">
      <div className="admin-head">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1 className="page-head__title">ניהול אוהלים</h1>
          <p className="page-head__sub">הוספה, עריכה ומחיקה של אוהלים באתר.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => {
            setEditingId(null)
            setMsg(null)
            setAdding((v) => !v)
          }}
        >
          {adding ? 'ביטול' : 'הוספת אוהל'}
        </button>
      </div>

      {site && <p className="admin-note">אתר: <strong>{site.name}</strong></p>}

      {msg && (
        <div
          className={`banner ${msg.kind === 'ok' ? 'banner--ok' : 'banner--error'} page__alert`}
          role="status"
        >
          {msg.text}
        </div>
      )}

      {loadError && (
        <p className="banner banner--error page__alert" role="alert">
          {loadError}
        </p>
      )}

      <div className="card" style={{ padding: '16px 18px' }}>
        {adding && site && (
          <TentForm
            key="add"
            siteId={site.id}
            siteName={site.name}
            busy={busy}
            submitLabel="הוספת אוהל"
            onSubmit={createTent}
            onCancel={() => setAdding(false)}
          />
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>אוהל</th>
                <th>סוג</th>
                <th>תפוסה</th>
                <th>מחיר / לילה</th>
                <th>סטטוס</th>
                <th>הזמנה פעילה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">אין אוהלים בעמוד זה.</td>
                </tr>
              )}
              {data?.items.map((tent) => {
                const booked = activeReservation(reservationsByTent[tent.id] ?? [], today)
                const typeHe = TENT_TYPES_HE[tent.type] ?? TENT_TYPES_HE[0]
                return (
                  <tr key={tent.id} className={tent.isActive ? undefined : 'admin-table__row--off'}>
                    <td><strong>{tent.label}</strong></td>
                    <td>{typeHe}</td>
                    <td className="admin-table__num">{tent.capacity}</td>
                    <td className="admin-table__num">₪{tent.pricePerNight.toFixed(0)}</td>
                    <td>
                      <span className={`pill ${tent.isActive ? 'pill--on' : 'pill--off'}`}>
                        {tent.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                    <td>
                      {booked ? (
                        <span className="pill pill--now" title={`עד ${fmt(booked.endDate)}`}>
                          מאוכלס
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => {
                            setAdding(false)
                            setMsg(null)
                            setEditingId((c) => (c === tent.id ? null : tent.id))
                          }}
                        >
                          {editingId === tent.id ? 'סגירה' : 'עריכה'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy || booked != null}
                          title={
                            booked != null
                              ? 'לא ניתן למחוק אוהל עם הזמנה פעילה'
                              : undefined
                          }
                          onClick={() => deleteTent(tent)}
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {editingTent && site && (
          <TentForm
            key={`edit-${editingTent.id}`}
            siteId={site.id}
            siteName={site.name}
            initial={editingTent}
            busy={busy}
            submitLabel="שמירת שינויים"
            onSubmit={(input) => updateTent(editingTent.id, input)}
            onCancel={() => setEditingId(null)}
          />
        )}
      </div>
    </div>
  )
}

type TentFormProps = {
  siteId: number
  siteName: string
  initial?: Tent
  busy: boolean
  submitLabel: string
  onSubmit: (input: TentInput) => void
  onCancel: () => void
}

// Compact add / edit form. Client-side checks mirror TentRequest + TentService;
// the server stays the source of truth and its errors surface in the page banner.
function TentForm({ siteId, siteName, initial, busy, submitLabel, onSubmit, onCancel }: TentFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<number>(initial?.type ?? 0)
  const [capacity, setCapacity] = useState<string>(String(initial?.capacity ?? 2))
  const [price, setPrice] = useState<string>(String(initial?.pricePerNight ?? 0))
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)

  const labelTrimmed = label.trim()
  const capacityNum = Number(capacity)
  const priceNum = Number(price)
  const valid =
    labelTrimmed.length >= 1 &&
    labelTrimmed.length <= 50 &&
    Number.isInteger(capacityNum) &&
    capacityNum >= 1 &&
    capacityNum <= 20 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    priceNum <= 100000

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!valid || busy) return
    onSubmit({
      campingSiteId: siteId,
      label: labelTrimmed,
      type,
      capacity: capacityNum,
      pricePerNight: priceNum,
      isActive,
    })
  }

  return (
    <form className="tent-form" onSubmit={submit}>
      <div className="field">
        <span>אתר</span>
        <span className="tent-form__site">{siteName}</span>
      </div>

      <label className="field">
        <span>שם / מספר האוהל</span>
        <input
          type="text"
          value={label}
          maxLength={50}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="לדוגמה: A-4"
        />
      </label>

      <label className="field">
        <span>סוג</span>
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {TENT_TYPES.map((_, i) => (
            <option key={i} value={i}>{TENT_TYPES_HE[i]}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>תפוסה (1–20)</span>
        <input
          type="number"
          min={1}
          max={20}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </label>

      <label className="field">
        <span>מחיר ללילה (₪)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      <div className="field">
        <span>סטטוס</span>
        <label className="checkline">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          זמין להזמנה
        </label>
      </div>

      <div className="tent-form__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={!valid || busy}>
          {busy ? 'שומר…' : submitLabel}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  )
}
