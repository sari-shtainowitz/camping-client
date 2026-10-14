import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ApiError, api, tokenExpiresAt } from '../api'
import { useAuth } from '../auth'
import type { CampSite, PagedResult, ReservationResponse, Tent } from '../types'
import { TENT_TYPES_HE } from '../types'
import { ConfirmationDocument } from '../pdf/ConfirmationDocument'
import type { ConfirmationData } from '../pdf/ConfirmationDocument'
import {
  cardBrand,
  cvvValid,
  digitsOnly,
  expiryValid,
  formatCardNumber,
  formatExpiry,
  holderValid,
  lastFour,
  luhnValid,
} from '../lib/card'

/** How long a guest has to pay after choosing a tent. */
export const CHECKOUT_MINUTES = 15

/** Router state handed over by the tent page when "המשך לתשלום" is clicked. */
export type CheckoutState = {
  tentId: number
  start: string
  end: string
  /** ms since epoch - when the payment window closes. */
  expiresAt: number
}

// Holds that already turned into a reservation in this tab, so going "back" to
// the checkout page can never charge / book the same hold twice.
const DONE_KEY = 'camping.checkout.done'

function holdKey(s: CheckoutState): string {
  return `${s.tentId}:${s.start}:${s.end}:${s.expiresAt}`
}

function isHoldDone(s: CheckoutState): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]') as string[]).includes(holdKey(s))
  } catch {
    return false
  }
}

function markHoldDone(s: CheckoutState): void {
  try {
    const list = JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]') as string[]
    sessionStorage.setItem(DONE_KEY, JSON.stringify([...list, holdKey(s)].slice(-20)))
  } catch {
    /* sessionStorage unavailable - the server still rejects a duplicate booking */
  }
}

function isCheckoutState(v: unknown): v is CheckoutState {
  const s = v as Partial<CheckoutState> | null
  return (
    !!s &&
    typeof s.tentId === 'number' &&
    typeof s.start === 'string' &&
    typeof s.end === 'string' &&
    typeof s.expiresAt === 'number'
  )
}

function fmt(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function nightsBetween(start: string, end: string): number {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Hebrew message for a failed POST /reservations. The server's business-rule
// messages are English, so the known ones are translated here.
function bookingError(e: unknown): string {
  if (e instanceof ApiError) {
    // 409 Conflict = the tent is taken: either already booked for these dates,
    // or another guest's request won a race for it a moment ago.
    if (e.status === 409 && /already reserved/i.test(e.detail))
      return 'האוהל כבר תפוס בתאריכים שנבחרו (409).'
    if (e.status === 409) return 'האוהל נתפס ממש עכשיו על ידי אורח אחר (409).'
    if (e.status === 401) return 'תוקף ההתחברות פג. התחברו מחדש ונסו שוב.'
    if (e.status === 400 && /in the past/i.test(e.detail)) return 'תאריך ההגעה כבר עבר.'
    if (e.status === 400 && /not active/i.test(e.detail)) return 'האוהל אינו זמין להזמנה כרגע.'
    return `שגיאה ${e.status}: ${e.detail}`
  }
  return 'לא ניתן להתחבר לשרת. בדקו את החיבור ונסו שוב.'
}

type Phase =
  | { kind: 'form' }
  | { kind: 'processing'; step: 'payment' | 'booking' }
  | { kind: 'done'; confirmation: ConfirmationData; raceNote?: string }
  | { kind: 'failed'; text: string }
  | { kind: 'expired' }

type FieldErrors = Partial<Record<'number' | 'holder' | 'expiry' | 'cvv', string>>

// Mock checkout. Choosing a tent only opens this page - nothing is sent to the
// server yet, so leaving the page or letting the timer run out simply drops the
// hold and the tent is never taken. The reservation is POSTed (existing
// endpoint, unchanged payload) only after the mock card payment is approved,
// and the receipt is shown only when the server accepted it.
export function CheckoutPage() {
  const location = useLocation()
  const hold = isCheckoutState(location.state) ? location.state : null

  if (!hold) return <Navigate to="/tents" replace />
  return <Checkout key={holdKey(hold)} hold={hold} />
}

function Checkout({ hold }: { hold: CheckoutState }) {
  const { user } = useAuth()

  const [tent, setTent] = useState<Tent | null>(null)
  const [site, setSite] = useState<CampSite | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<Phase>(() =>
    Date.now() >= hold.expiresAt ? { kind: 'expired' } : { kind: 'form' },
  )
  const [alreadyDone] = useState(() => isHoldDone(hold))

  // Card fields live only in this component's state; they are cleared the
  // moment the payment is decided and are never stored or sent anywhere.
  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  // Demo of the server's 409 handling: after payment, send the SAME booking
  // twice at once - the server accepts one and rejects the other with 409.
  const [simulateRace, setSimulateRace] = useState(false)

  const [pdfBusy, setPdfBusy] = useState(false)
  const confRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api<Tent>(`/tents/${hold.tentId}`)
      .then((t) => {
        if (!cancelled) setTent(t)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.detail : (e as Error).message)
      })
    api<PagedResult<CampSite>>('/camping-sites?pageSize=100')
      .then((sites) => {
        if (!cancelled) setSite(sites.items[0] ?? null)
      })
      .catch(() => {
        /* the receipt just omits the site line */
      })
    return () => {
      cancelled = true
    }
  }, [hold.tentId])

  // Countdown. When it reaches zero while the guest is still on the form the
  // hold is dropped - nothing was ever sent, so the tent stays free.
  useEffect(() => {
    if (phase.kind !== 'form') return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= hold.expiresAt) {
        clearCard()
        setPhase({ kind: 'expired' })
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase.kind, hold.expiresAt])

  function clearCard() {
    setNumber('')
    setHolder('')
    setExpiry('')
    setCvv('')
    setErrors({})
  }

  function validate(): FieldErrors {
    const e: FieldErrors = {}
    if (!luhnValid(number)) e.number = 'מספר כרטיס לא תקין'
    if (!holderValid(holder)) e.holder = 'נא להזין את השם כפי שמופיע על הכרטיס'
    if (!expiryValid(expiry)) e.expiry = /^\d{2}\/\d{2}$/.test(expiry) ? 'תוקף הכרטיס עבר או לא תקין' : 'פורמט MM/YY'
    if (!cvvValid(cvv)) e.cvv = '3 ספרות'
    return e
  }

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (phase.kind !== 'form' || !tent || !user) return

    if (Date.now() >= hold.expiresAt) {
      clearCard()
      setPhase({ kind: 'expired' })
      return
    }

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const exp = tokenExpiresAt()
    if (exp !== null && exp <= Date.now() + 5_000) {
      clearCard()
      setPhase({ kind: 'failed', text: 'תוקף ההתחברות פג. התחברו מחדש ונסו שוב. לא בוצע חיוב.' })
      return
    }

    // Keep only what the receipt needs, then forget the card.
    const payment = { brand: cardBrand(number), last4: lastFour(number) }
    clearCard()

    // 1. Mock payment authorisation (no real provider).
    setPhase({ kind: 'processing', step: 'payment' })
    await sleep(1200)

    // 2. Payment approved -> only now is the reservation sent to the server.
    setPhase({ kind: 'processing', step: 'booking' })

    // The guest is NOT sent: the server books for the user in the JWT.
    const post = () =>
      api<ReservationResponse>('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          tentId: hold.tentId,
          startDate: hold.start,
          endDate: hold.end,
          status: 1,
        }),
      })

    const results = simulateRace
      ? await Promise.allSettled([post(), post()])
      : await Promise.allSettled([post()])

    const won = results.find(
      (r): r is PromiseFulfilledResult<ReservationResponse> => r.status === 'fulfilled',
    )
    const lost = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')

    if (!won) {
      setPhase({
        kind: 'failed',
        text: `${bookingError(lost?.reason)} החיוב בוטל ולא נגבה תשלום.`,
      })
      return
    }

    markHoldDone(hold)
    setPhase({
      kind: 'done',
      confirmation: {
        reservation: won.value,
        tent,
        site,
        guestName: user.fullName,
        guestEmail: user.email,
        payment,
      },
      raceNote: simulateRace
        ? lost
          ? `הדגמת 409: נשלחו שתי הזמנות זהות במקביל. השרת אישר אחת ודחה את השנייה — ${bookingError(lost.reason)}`
          : 'הדגמת 409: שתי הבקשות התקבלו (לא צפוי - בדקו את השרת).'
        : undefined,
    })
  }

  async function downloadPdf() {
    if (phase.kind !== 'done' || !confRef.current) return
    setPdfBusy(true)
    try {
      const { generateConfirmationPdf } = await import('../pdf/generate')
      await generateConfirmationPdf(confRef.current, phase.confirmation.reservation.id)
    } catch {
      /* the on-screen receipt is still there */
    } finally {
      setPdfBusy(false)
    }
  }

  const nights = nightsBetween(hold.start, hold.end)
  const estimate = tent ? nights * tent.pricePerNight : 0
  const remaining = hold.expiresAt - now
  const typeHe = tent ? TENT_TYPES_HE[tent.type] ?? TENT_TYPES_HE[0] : ''

  if (alreadyDone && phase.kind !== 'done') {
    return (
      <div className="page page--narrow">
        <div className="page-head">
          <h1 className="page-head__title">תשלום</h1>
        </div>
        <p className="banner banner--ok">ההזמנה הזו כבר שולמה ואושרה.</p>
        <div className="checkout__links">
          <Link className="btn btn--primary" to="/my-reservations">להזמנות שלי</Link>
          <Link className="btn btn--ghost" to="/tents">חזרה לאוהלים</Link>
        </div>
      </div>
    )
  }

  if (phase.kind === 'done') {
    const c = phase.confirmation
    const r = c.reservation
    return (
      <div className="page page--narrow">
        <div className="page-head">
          <h1 className="page-head__title">התשלום אושר</h1>
          <p className="page-head__sub">ההזמנה נקלטה, והאוהל שמור עבורך.</p>
        </div>

        {phase.raceNote && (
          <p className="banner banner--warn page__alert" role="status">
            {phase.raceNote}
          </p>
        )}

        <div className="card receipt">
          <div className="receipt__head">
            <span className="receipt__ok">✓ התשלום אושר</span>
            <span className="receipt__id">הזמנה #{r.id}</span>
          </div>
          <dl className="receipt__rows">
            <div><dt>שם האורח</dt><dd>{c.guestName}</dd></div>
            <div><dt>אוהל</dt><dd>{c.tent.label} · {TENT_TYPES_HE[c.tent.type] ?? TENT_TYPES_HE[0]}</dd></div>
            <div><dt>תאריכים</dt><dd>{fmt(r.startDate)}–{fmt(r.endDate)} · {nightsBetween(r.startDate, r.endDate)} לילות</dd></div>
            <div>
              <dt>אמצעי תשלום</dt>
              <dd><bdi dir="ltr">{c.payment?.brand ?? 'כרטיס'} •••• {c.payment?.last4}</bdi></dd>
            </div>
            <div className="receipt__total"><dt>סה״כ שולם</dt><dd>₪{r.totalPrice.toFixed(0)}</dd></div>
          </dl>
          <p className="receipt__note">זהו תשלום הדגמה — לא בוצע חיוב אמיתי.</p>
        </div>

        <div className="checkout__links">
          <button className="btn btn--primary" type="button" disabled={pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? 'מכין קובץ…' : 'הורדת קבלה (PDF)'}
          </button>
          <Link className="btn btn--ghost" to="/my-reservations">להזמנות שלי</Link>
          <Link className="btn btn--ghost" to="/reviews">כתבו לנו המלצה</Link>
        </div>

        {/* Off-screen source for the PDF receipt. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 0 }}>
          <ConfirmationDocument ref={confRef} data={c} />
        </div>
      </div>
    )
  }

  const busy = phase.kind === 'processing'
  const urgent = remaining <= 2 * 60_000

  return (
    <div className="page page--narrow">
      <Link to={`/tents?tent=${hold.tentId}`} className="btn btn--ghost btn--sm backlink">
        → ביטול וחזרה לאוהל
      </Link>

      <div className="page-head">
        <h1 className="page-head__title">תשלום</h1>
        <p className="page-head__sub">
          ההזמנה תישלח ותאושר רק לאחר שהתשלום יאושר. האוהל אינו נתפס עד אז.
        </p>
      </div>

      {loadError && (
        <p className="banner banner--error page__alert" role="alert">{loadError}</p>
      )}

      <div className="card checkout__summary">
        <div>
          <span className="checkout__tent">אוהל {tent?.label ?? `#${hold.tentId}`}</span>
          {tent && <span className="muted"> · {typeHe}</span>}
          <div className="checkout__dates">
            {fmt(hold.start)}–{fmt(hold.end)} · {nights} לילות
          </div>
        </div>
        <div className="checkout__price">
          <span>לתשלום</span>
          <b>{tent ? `₪${estimate.toFixed(0)}` : '…'}</b>
        </div>
      </div>

      {phase.kind === 'expired' ? (
        <div className="card checkout__panel">
          <p className="banner banner--warn" role="alert">
            הזמן להשלמת התשלום ({CHECKOUT_MINUTES} דקות) הסתיים. ההזמנה לא נשלחה והאוהל לא נתפס.
          </p>
          <Link className="btn btn--primary" to={`/tents?tent=${hold.tentId}`}>
            בחירה מחדש
          </Link>
        </div>
      ) : phase.kind === 'failed' ? (
        <div className="card checkout__panel">
          <p className="banner banner--error" role="alert">{phase.text}</p>
          <Link className="btn btn--primary" to="/tents">חזרה לאוהלים</Link>
        </div>
      ) : (
        <form className="card checkout__panel form" onSubmit={pay} noValidate>
          <div className={urgent ? 'timer timer--urgent' : 'timer'} role="timer" aria-live="off">
            <span>הזמן שנותר להשלמת התשלום</span>
            <b dir="ltr">{mmss(remaining)}</b>
          </div>

          <div className="field">
            <label htmlFor="cc-number">מספר כרטיס</label>
            <input
              id="cc-number"
              dir="ltr"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={number}
              disabled={busy}
              aria-invalid={!!errors.number}
              onChange={(e) => setNumber(formatCardNumber(e.target.value))}
            />
            {errors.number && <span className="field__error">{errors.number}</span>}
          </div>

          <div className="field">
            <label htmlFor="cc-name">שם בעל הכרטיס</label>
            <input
              id="cc-name"
              autoComplete="cc-name"
              value={holder}
              disabled={busy}
              aria-invalid={!!errors.holder}
              onChange={(e) => setHolder(e.target.value)}
            />
            {errors.holder && <span className="field__error">{errors.holder}</span>}
          </div>

          <div className="checkout__row">
            <div className="field">
              <label htmlFor="cc-exp">תוקף</label>
              <input
                id="cc-exp"
                dir="ltr"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                disabled={busy}
                aria-invalid={!!errors.expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              />
              {errors.expiry && <span className="field__error">{errors.expiry}</span>}
            </div>
            <div className="field">
              <label htmlFor="cc-cvv">CVV</label>
              <input
                id="cc-cvv"
                dir="ltr"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                maxLength={3}
                value={cvv}
                disabled={busy}
                aria-invalid={!!errors.cvv}
                onChange={(e) => setCvv(digitsOnly(e.target.value).slice(0, 3))}
              />
              {errors.cvv && <span className="field__error">{errors.cvv}</span>}
            </div>
          </div>

          <label className="checkout__demo">
            <input
              type="checkbox"
              checked={simulateRace}
              disabled={busy}
              onChange={(e) => setSimulateRace(e.target.checked)}
            />
            <span>
              <strong>הדגמת התנגשות (409):</strong> אחרי התשלום לשלוח את ההזמנה פעמיים במקביל
            </span>
          </label>

          <button className="btn btn--primary btn--block" type="submit" disabled={busy || !tent}>
            {phase.kind === 'processing'
              ? phase.step === 'payment'
                ? 'מאמת תשלום…'
                : 'שומר את ההזמנה…'
              : `תשלום ₪${estimate.toFixed(0)}`}
          </button>

          <p className="checkout__hint">
            תשלום הדגמה בלבד — אין חיוב אמיתי ופרטי הכרטיס אינם נשמרים. לבדיקה:{' '}
            <bdi dir="ltr">4242 4242 4242 4242</bdi>, תוקף עתידי כלשהו ו-CVV בן 3 ספרות.
          </p>
        </form>
      )}
    </div>
  )
}
