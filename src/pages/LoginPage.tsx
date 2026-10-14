import { useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth'

type Mode = 'login' | 'register'

function TentMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M12 3 21 20H3Z" fill="currentColor" />
      <path d="M12 9.5 16.4 20H7.6Z" fill="#1c3025" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  )
}

// ---- night scene ---------------------------------------------------------------
// Purely decorative. Star / firefly positions come from a fixed-seed generator so
// they are identical on every render and every visit.

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const STARS = (() => {
  const rnd = seeded(42)
  return Array.from({ length: 90 }, (_, i) => ({
    id: i,
    x: rnd() * 100,
    y: rnd() * 58,
    size: rnd() < 0.12 ? 3 : rnd() < 0.5 ? 2 : 1.3,
    delay: rnd() * 5,
    duration: 2.5 + rnd() * 3.5,
  }))
})()

const FIREFLIES = (() => {
  const rnd = seeded(7)
  return Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 4 + rnd() * 92,
    y: 70 + rnd() * 24,
    delay: rnd() * 6,
    duration: 5 + rnd() * 5,
  }))
})()

const SPARKS = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  dx: (i % 3) * 7 - 7,
  delay: i * 0.45,
}))

function Pine({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="0" width="6" height="18" fill="#0a140f" />
      <polygon points="0,-120 26,-62 14,-62 38,-18 20,-18 46,10 -46,10 -20,-18 -38,-18 -14,-62 -26,-62" />
    </g>
  )
}

function NightScene() {
  return (
    <div className="night" aria-hidden="true">
      <div className="night__stars">
        {STARS.map((s) => (
          <span
            key={s.id}
            className="night__star"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
        <span className="night__shooting" />
        <span className="night__shooting night__shooting--late" />
      </div>

      <svg className="night__land" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="moonGlow">
            <stop offset="0" stopColor="#fff4d6" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#ffe7b0" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ffe7b0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f3b4f" />
            <stop offset="1" stopColor="#0f2230" />
          </linearGradient>
          <radialGradient id="fireGlow">
            <stop offset="0" stopColor="#ffb347" stopOpacity="0.75" />
            <stop offset="0.4" stopColor="#ff7a2a" stopOpacity="0.25" />
            <stop offset="1" stopColor="#ff7a2a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="tentLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd27a" />
            <stop offset="1" stopColor="#f08a3a" />
          </linearGradient>
        </defs>

        {/* moon */}
        <circle cx="1130" cy="170" r="190" fill="url(#moonGlow)" className="night__moon-glow" />
        <g className="night__moon">
          <circle cx="1130" cy="170" r="48" fill="#fff6de" />
          <circle cx="1114" cy="158" r="9" fill="#efe2bf" opacity="0.7" />
          <circle cx="1146" cy="186" r="6" fill="#efe2bf" opacity="0.6" />
        </g>

        {/* lightning - only shown while the "⚡" chip is hovered */}
        <path
          className="night__lightning"
          d="M760 110 L726 220 L772 220 L712 365 L750 365 L670 520"
          fill="none"
          stroke="#fffbe0"
          strokeWidth="5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* far mountains */}
        <path
          d="M0 560 L120 470 L230 520 L380 400 L520 500 L640 430 L780 520 L930 380 L1080 490 L1220 420 L1340 480 L1440 440 L1440 900 L0 900Z"
          fill="#22374d"
        />
        {/* mid mountains */}
        <path
          d="M0 610 L160 520 L300 590 L450 500 L610 600 L760 540 L900 610 L1050 520 L1220 600 L1340 550 L1440 590 L1440 900 L0 900Z"
          fill="#18293a"
        />

        {/* lake with moon reflection */}
        <rect x="0" y="640" width="1440" height="80" fill="url(#lake)" />
        <g className="night__ripples" fill="#fff1c9">
          <rect x="1090" y="652" width="80" height="2.5" rx="1.25" opacity="0.55" />
          <rect x="1104" y="664" width="52" height="2" rx="1" opacity="0.45" />
          <rect x="1080" y="676" width="96" height="2" rx="1" opacity="0.35" />
          <rect x="1110" y="690" width="40" height="2" rx="1" opacity="0.3" />
          <rect x="1096" y="704" width="64" height="1.6" rx="0.8" opacity="0.2" />
        </g>

        {/* near ground */}
        <path
          d="M0 720 C 200 690, 380 735, 560 712 S 900 690, 1100 718 S 1340 700, 1440 712 L1440 900 L0 900Z"
          fill="#0f1d17"
        />

        {/* pine silhouettes */}
        <g fill="#0b1712">
          <Pine x={60} y={730} s={1.5} />
          <Pine x={150} y={740} s={1.05} />
          <Pine x={230} y={728} s={1.3} />
          <Pine x={1240} y={736} s={1.2} />
          <Pine x={1330} y={724} s={1.6} />
          <Pine x={1410} y={738} s={1.1} />
        </g>

        {/* glowing tent */}
        <g transform="translate(860 772)">
          <ellipse cx="0" cy="40" rx="120" ry="14" fill="#000" opacity="0.35" />
          <g className="night__tent">
            <polygon points="0,-78 92,40 -92,40" fill="#2c4a38" />
            <polygon points="0,-78 30,40 -30,40" fill="url(#tentLight)" className="night__tent-light" />
            <polygon points="0,-78 6,-90 -6,-90" fill="#6f5a43" />
          </g>
        </g>

        {/* campfire */}
        <g transform="translate(640 812)"><g className="night__fire">
          <circle cx="0" cy="-16" r="170" fill="url(#fireGlow)" className="night__fire-glow" />
          <rect x="-34" y="-4" width="68" height="10" rx="5" fill="#5a3b22" transform="rotate(12)" />
          <rect x="-34" y="-4" width="68" height="10" rx="5" fill="#6b4529" transform="rotate(-12)" />
          <path className="night__flame" d="M0 -78 C 26 -44, 30 -16, 0 4 C -30 -16, -26 -44, 0 -78 Z" fill="#ff7a2a" />
          <path className="night__flame night__flame--mid" d="M0 -56 C 17 -32, 19 -12, 0 2 C -19 -12, -17 -32, 0 -56 Z" fill="#ffb347" />
          <path className="night__flame night__flame--core" d="M0 -34 C 9 -20, 10 -8, 0 0 C -10 -8, -9 -20, 0 -34 Z" fill="#fff0b3" />
          {SPARKS.map((s) => (
            <circle
              key={s.id}
              className="night__spark"
              cx={s.dx}
              cy="-60"
              r="2.2"
              fill="#ffcf6b"
              style={{ animationDelay: `${s.delay}s` }}
            />
          ))}
        </g></g>
      </svg>
      <div className="night__flash" />

      <div className="night__fireflies">
        {FIREFLIES.map((f) => (
          <span
            key={f.id}
            className="night__firefly"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ---- hero chips ------------------------------------------------------------------
// Hovering a chip lights up its part of the scene: the tent, the moon, or a
// lightning strike across the sky.

type ChipId = 'tent' | 'moon' | 'bolt'

const CHIPS: { id: ChipId; icon: string; text: string }[] = [
  { id: 'tent', icon: '⛺', text: 'אוהלים זוגיים, משפחתיים ויוקרתיים' },
  { id: 'moon', icon: '🌙', text: 'לילות שקטים מול האגם' },
  { id: 'bolt', icon: '⚡', text: 'הזמנה ותשלום תוך דקות' },
]

// "Magnetic" chips: they lean toward the pointer, tilt in 3D to face it, and a
// glare spot follows it across the chip.
function magnet(e: PointerEvent<HTMLElement>) {
  if (e.pointerType === 'touch') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5 // -0.5 .. 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--tx', `${px * 12}px`)
  el.style.setProperty('--ty', `${py * 10}px`)
  el.style.setProperty('--rx', `${py * -28}deg`)
  el.style.setProperty('--ry', `${px * 26}deg`)
  el.style.setProperty('--gx', `${(px + 0.5) * 100}%`)
  el.style.setProperty('--gy', `${(py + 0.5) * 100}%`)
}

function resetMagnet(el: HTMLElement) {
  for (const p of ['--tx', '--ty']) el.style.setProperty(p, '0px')
  for (const p of ['--rx', '--ry']) el.style.setProperty(p, '0deg')
}

// Login and Registration. The auth/JWT logic lives in ../auth + ../api, which are
// unchanged - this file is presentation/wording only.
export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Which hero chip is hovered - the night scene reacts to it (CSS, data-focus).
  const [sceneFocus, setSceneFocus] = useState<ChipId | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register({
          fullName: fullName.trim(),
          email: email.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          password,
        })
      }
      // Land on the role's home screen (see route table in App.tsx).
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  const isLogin = mode === 'login'

  return (
    <div className="auth-screen" data-focus={sceneFocus ?? undefined}>
      <NightScene />

      <div className="auth-layout">
        <section className="auth-hero">
          <span className="auth-hero__eyebrow">
            <span className="auth-hero__dot" /> מחנה האורנים · קמפינג על שפת האגם
          </span>
          <h1 className="auth-hero__title">
            הלילה הבא שלך
            <br />
            <span className="auth-hero__accent">מתחת לכוכבים</span>
          </h1>
          <p className="auth-hero__sub">
            אוהלים בין עצי האורן, מדורה מול האגם ושקט שאין בעיר. בוחרים תאריכים, בוחרים אוהל —
            והמקום שלכם שמור.
          </p>
          <ul className="auth-hero__chips">
            {CHIPS.map((c) => (
              <li
                key={c.id}
                className={`chip chip--${c.id}`}
                tabIndex={0}
                onPointerEnter={() => setSceneFocus(c.id)}
                onPointerLeave={(e) => {
                  setSceneFocus(null)
                  resetMagnet(e.currentTarget)
                }}
                onPointerMove={magnet}
                onFocus={() => setSceneFocus(c.id)}
                onBlur={() => setSceneFocus(null)}
              >
                <span className="chip__ring" aria-hidden="true" />
                <span className="chip__icon" aria-hidden="true">{c.icon}</span>
                <span className="chip__text">{c.text}</span>
                {c.id === 'bolt' && (
                  <span className="chip__sparks" aria-hidden="true">
                    <i /><i /><i /><i /><i /><i />
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link to="/reviews" className="auth-hero__link">
            מה האורחים שלנו מספרים ←
          </Link>
        </section>

        <div className="auth-card">
          <div className="auth-card__brand">
            <span className="auth-card__mark">
              <TentMark />
            </span>
            <span className="auth-card__brand-name">מחנה האורנים</span>
          </div>

          <h2 className="auth-card__title">{isLogin ? 'ברוכים השבים 👋' : 'מצטרפים למחנה 🔥'}</h2>
          <p className="auth-card__hint">
            {isLogin ? 'התחברו כדי להזמין את האוהל שלכם.' : 'כמה פרטים ואתם בפנים.'}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="מצב הזדהות" data-mode={mode}>
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              className="auth-tabs__btn"
              onClick={() => switchMode('login')}
            >
              התחברות
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              className="auth-tabs__btn"
              onClick={() => switchMode('register')}
            >
              הרשמה
            </button>
          </div>

          <form className="form auth-form" onSubmit={submit} key={mode}>
            {!isLogin && (
              <div className="field">
                <label htmlFor="fullName">שם מלא</label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="ישראל ישראלי"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="email">דוא"ל</label>
              <input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            {!isLogin && (
              <div className="field">
                <label htmlFor="phone">
                  טלפון <span className="field__opt">לא חובה</span>
                </label>
                <input
                  id="phone"
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  autoComplete="tel"
                  placeholder="050-0000000"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="password">סיסמה</label>
              <div className="auth-password">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="לפחות 8 תווים"
                />
                <button
                  type="button"
                  className="auth-password__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
                  aria-pressed={showPassword}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <p className="banner banner--error" role="alert">
                {error}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'רגע…' : isLogin ? 'יוצאים לדרך' : 'יצירת חשבון'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
