import { forwardRef } from 'react'
import type { CampSite, ReservationResponse, Tent } from '../types'
import { TENT_TYPES_HE } from '../types'

export type ConfirmationData = {
  reservation: ReservationResponse
  tent: Tent
  site: CampSite | null
  guestName: string
  guestEmail: string
  // Mock card payment made at checkout. Only the brand and the last 4 digits
  // are ever kept - never the full number or the CVV.
  payment?: { brand: string | null; last4: string } | null
}

// Concrete colours only (no CSS variables / modern colour functions) so
// html2canvas renders the document faithfully.
const C = {
  pine: '#2c4a38',
  pineDeep: '#1c3025',
  ink: '#23281f',
  soft: '#52584a',
  muted: '#857c6c',
  line: '#e2d9c4',
  cream: '#f6f1e4',
  paper: '#ffffff',
  gold: '#d8a84a',
  okBg: '#e6efdd',
  okInk: '#365f3a',
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function nightsBetween(startIso: string, endIso: string): number {
  const a = Date.parse(startIso)
  const b = Date.parse(endIso)
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / 86_400_000)
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 24,
        padding: '11px 0',
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <span style={{ color: C.muted, fontWeight: 600, fontSize: 13 }}>{label}</span>
      <span
        style={{
          fontSize: strong ? 18 : 14,
          fontWeight: strong ? 700 : 500,
          color: strong ? C.pine : C.ink,
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * An off-screen, A4-width booking confirmation. html2canvas rasterises this exact
 * DOM (with the app's already-loaded Hebrew fonts and full bidi support) into the
 * PDF, so the Hebrew / RTL layout is always correct.
 */
export const ConfirmationDocument = forwardRef<HTMLDivElement, { data: ConfirmationData }>(
  function ConfirmationDocument({ data }, ref) {
    const { reservation: r, tent, site, guestName, guestEmail, payment } = data
    const typeHe = TENT_TYPES_HE[tent.type] ?? TENT_TYPES_HE[0]
    const nights = nightsBetween(r.startDate, r.endDate)
    const generated = new Date().toLocaleString('he-IL', { dateStyle: 'long', timeStyle: 'short' })

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          width: 794,
          boxSizing: 'border-box',
          background: C.paper,
          color: C.ink,
          fontFamily: "'Assistant', 'Arial Hebrew', Arial, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            background: `linear-gradient(160deg, ${C.pine}, ${C.pineDeep})`,
            color: C.paper,
            padding: '34px 44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
              <path d="M12 3 21 20H3Z" fill={C.cream} />
              <path d="M12 9.5 16.4 20H7.6Z" fill={C.pine} />
            </svg>
            <div>
              <div style={{ fontFamily: "'Frank Ruhl Libre', Georgia, serif", fontSize: 23, fontWeight: 700 }}>
                מחנה האורנים
              </div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>אישור הזמנה</div>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>מספר הזמנה</div>
            <div style={{ fontFamily: "'Frank Ruhl Libre', Georgia, serif", fontSize: 27, fontWeight: 700 }}>
              #{r.id}
            </div>
          </div>
        </div>

        <div style={{ padding: '30px 44px 38px' }}>
          <div
            style={{
              display: 'inline-block',
              background: C.okBg,
              color: C.okInk,
              fontSize: 13,
              fontWeight: 700,
              padding: '5px 14px',
              borderRadius: 999,
              marginBottom: 22,
            }}
          >
            {payment ? '✓ התשלום אושר · ההזמנה אושרה' : '✓ ההזמנה אושרה'}
          </div>

          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '4px 20px 12px',
              background: C.cream,
            }}
          >
            <Row label="שם האורח" value={guestName} />
            <Row label={'דוא"ל'} value={guestEmail} />
            {site && <Row label="אתר המחנה" value={`${site.name} · ${site.address}`} />}
            <Row label="אוהל" value={`${tent.label} · ${typeHe}`} />
            <Row label="תפוסה מרבית" value={`${tent.capacity} אורחים`} />
            <Row label="תאריך הגעה" value={longDate(r.startDate)} />
            <Row label="תאריך עזיבה" value={longDate(r.endDate)} />
            <Row label="מספר לילות" value={String(nights)} />
            <Row label="מחיר ללילה" value={`₪${tent.pricePerNight.toFixed(0)}`} />
            <div style={{ height: 6 }} />
            {payment && (
              <Row
                label="אמצעי תשלום"
                value={`${payment.brand ?? 'כרטיס אשראי'} ⁦•••• ${payment.last4}⁩`}
              />
            )}
            <Row
              label={payment ? 'סך הכל שולם' : 'סך הכל לתשלום'}
              value={`₪${r.totalPrice.toFixed(0)}`}
              strong
            />
          </div>

          <p style={{ fontSize: 13, color: C.soft, lineHeight: 1.75, margin: '22px 0 0' }}>
            נא להציג אישור זה בעת ההגעה למחנה. הצ׳ק-אין מתאפשר החל מהשעה 14:00, והצ׳ק-אאוט עד השעה
            11:00. לשינוי או ביטול ניתן לפנות אלינו עד 48 שעות לפני מועד ההגעה.
          </p>
        </div>

        <div
          style={{
            borderTop: `3px solid ${C.gold}`,
            padding: '15px 44px',
            fontSize: 11,
            color: C.muted,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>מחנה האורנים · מערכת הזמנת אוהלים</span>
          <span>הופק בתאריך {generated}</span>
        </div>
      </div>
    )
  },
)
