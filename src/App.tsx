import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { LoginPage } from './pages/LoginPage'
import { TentsPage } from './pages/TentsPage'
import { CampMapPage } from './pages/CampMapPage'
import { MyReservationsPage } from './pages/MyReservationsPage'
import { AdminTentsPage } from './pages/AdminTentsPage'
import { AdminSchedulePage } from './pages/AdminSchedulePage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ReviewsPage } from './pages/ReviewsPage'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'site-nav__link is-active' : 'site-nav__link'
}

const ROLE_HE: Record<string, string> = {
  Customer: 'אורח',
  Admin: 'מנהל',
}

function TentMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M12 3 21 20H3Z" fill="currentColor" />
      <path d="M12 9.5 16.4 20H7.6Z" fill="var(--paper)" />
    </svg>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const chars = parts.slice(0, 2).map((p) => p[0]).join('')
  return chars.toUpperCase() || '?'
}

export function App() {
  const { user, ready, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Signing out always lands on the login page, even from a public page
  // like /reviews that would otherwise stay open.
  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }
  const isAdmin = user?.role === 'Admin'
  const homePath = isAdmin ? '/admin/tents' : '/tents'

  return (
    <div className="app">
      {/* The login page is a full-screen scene with its own branding - no top bar. */}
      {pathname !== '/login' && (
      <header className="site-header">
        <div className="site-header__inner">
          <span className="brand">
            <span className="brand__mark">
              <TentMark />
            </span>
            <span className="brand__name">מחנה האורנים</span>
          </span>

          {user && !isAdmin && (
            <nav className="site-nav" aria-label="ניווט">
              <NavLink to="/tents" className={navClass}>
                אוהלים
              </NavLink>
              <NavLink to="/map" className={navClass}>
                מפת המתחם
              </NavLink>
              <NavLink to="/my-reservations" className={navClass}>
                ההזמנות שלי
              </NavLink>
              <NavLink to="/reviews" className={navClass}>
                המלצות
              </NavLink>
            </nav>
          )}

          {/* The login page already links to reviews and holds the form itself. */}
          {!user && ready && pathname !== '/login' && (
            <nav className="site-nav" aria-label="ניווט">
              <NavLink to="/reviews" className={navClass}>
                המלצות
              </NavLink>
              <NavLink to="/login" className={navClass}>
                התחברות
              </NavLink>
            </nav>
          )}

          {isAdmin && (
            <nav className="site-nav" aria-label="ניווט מנהל">
              <NavLink to="/admin/tents" className={navClass}>
                ניהול אוהלים
              </NavLink>
              <NavLink to="/admin/schedule" className={navClass}>
                לוח הזמנות
              </NavLink>
              <NavLink to="/reviews" className={navClass}>
                המלצות
              </NavLink>
            </nav>
          )}

          {user && (
            <div className="userchip">
              <span className="userchip__avatar" aria-hidden="true">
                {initials(user.fullName)}
              </span>
              <span className="userchip__meta">
                <span className="userchip__name">{user.fullName}</span>
                <span className="userchip__role">{ROLE_HE[user.role] ?? user.role}</span>
              </span>
              <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
                התנתקות
              </button>
            </div>
          )}
        </div>
      </header>
      )}

      <main className="site-main">
        {!ready ? (
          <div className="loading-screen">
            <span className="spinner" aria-hidden="true" /> טוען…
          </div>
        ) : (
          <Routes>
            <Route
              path="/login"
              element={user ? <Navigate to={homePath} replace /> : <LoginPage />}
            />
            <Route
              path="/tents"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <Navigate to="/admin/tents" replace />
                ) : (
                  <TentsPage />
                )
              }
            />
            <Route
              path="/map"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <Navigate to="/admin/tents" replace />
                ) : (
                  <CampMapPage />
                )
              }
            />
            <Route
              path="/checkout"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <Navigate to="/admin/tents" replace />
                ) : (
                  <CheckoutPage />
                )
              }
            />
            {/* Public: every visitor can read reviews; only signed-in users can post. */}
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route
              path="/my-reservations"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <Navigate to="/admin/tents" replace />
                ) : (
                  <MyReservationsPage />
                )
              }
            />
            <Route
              path="/admin/tents"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <AdminTentsPage />
                ) : (
                  <Navigate to="/tents" replace />
                )
              }
            />
            <Route
              path="/admin/schedule"
              element={
                !user ? (
                  <Navigate to="/login" replace />
                ) : isAdmin ? (
                  <AdminSchedulePage />
                ) : (
                  <Navigate to="/tents" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to={user ? homePath : '/login'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  )
}
