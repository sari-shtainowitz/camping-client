import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { AuthResponse, CurrentUser } from './types'

export type RegisterInput = {
  fullName: string
  email: string
  phoneNumber?: string
  password: string
}

type AuthContextValue = {
  user: CurrentUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [ready, setReady] = useState(false)

  // On first load: if a JWT is already stored, confirm it is still valid by
  // calling /auth/me with it. If not, drop it.
  useEffect(() => {
    let cancelled = false
    if (!getToken()) {
      setReady(true)
      return
    }
    api<CurrentUser>('/auth/me')
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => setToken(null))
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function completeAuth(auth: AuthResponse) {
    setToken(auth.accessToken) // requirement 1: save the JWT after authentication
    const me = await api<CurrentUser>('/auth/me') // requirement 1: JWT is sent in the Authorization header
    setUser(me)
  }

  const value: AuthContextValue = {
    user,
    ready,
    login: async (email, password) => {
      const auth = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await completeAuth(auth)
    },
    register: async (input) => {
      const auth = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await completeAuth(auth)
    },
    logout: () => {
      setToken(null)
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
