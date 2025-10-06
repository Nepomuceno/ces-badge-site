import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { hashPasswordWithAlias, normalizeAlias } from '../lib/auth-utils'

const STORAGE_KEY = 'ces3-auth-user'

type AuthRole = 'admin' | 'member'

export interface AuthUser {
  alias: string
  email: string
  name: string
  role: AuthRole
  logos: string[]
  source: 'alias' | 'admin'
  hasPassword: boolean
}

interface AllowedUserRecord {
  alias: string
  email?: string
  name?: string
  role?: AuthRole
  logos?: string[]
  passwordHash?: string | null
}

type AuthDeniedReason =
  | 'alias-not-found'
  | 'password-required'
  | 'password-invalid'
  | 'network-error'
  | null

interface AliasCredentials {
  alias: string
  password?: string
}

export type AliasLoginResult =
  | { status: 'success'; user: AuthUser }
  | { status: 'password-required'; alias: string }
  | { status: 'error'; reason: Exclude<AuthDeniedReason, null> }

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isAllowed: boolean
  isAdmin: boolean
  loading: boolean
  deniedReason: AuthDeniedReason
  loginWithAlias: (credentials: AliasCredentials) => Promise<AliasLoginResult>
  logout: () => void
  clearDeniedReason: () => void
  refreshRoster: () => Promise<void>
}

const defaultAuthValue: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isAllowed: false,
  isAdmin: false,
  loading: false,
  deniedReason: null,
  loginWithAlias: async () => ({ status: 'error', reason: 'network-error' }),
  logout: () => undefined,
  clearDeniedReason: () => undefined,
  refreshRoster: async () => undefined,
}

const AuthContext = createContext<AuthContextValue>(defaultAuthValue)

function toAuthUser(
  record: AllowedUserRecord,
  normalizedAlias: string,
  source: AuthUser['source'],
): AuthUser {
  const alias = record.alias ? normalizeAlias(record.alias) : normalizedAlias
  const email = record.email ?? `${alias}@microsoft.com`
  const name = record.name ?? alias
  const logos = Array.isArray(record.logos) ? record.logos : []
  const role: AuthRole = record.role === 'admin' ? 'admin' : 'member'
  const hasPassword = Boolean(record.passwordHash)

  return {
    alias,
    email,
    name,
    logos,
    role,
    source,
    hasPassword,
  }
}

async function fetchAllowedUsers(): Promise<AllowedUserRecord[]> {
  const response = await fetch('/api/allowed-users', {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load allowed users (${response.status})`)
  }

  const data = (await response.json()) as AllowedUserRecord[]
  return Array.isArray(data) ? data : []
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [deniedReason, setDeniedReason] = useState<AuthDeniedReason>(null)
  const allowedUsersRef = useRef<AllowedUserRecord[] | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as Partial<AuthUser>
      if (parsed && typeof parsed.alias === 'string' && parsed.alias.trim()) {
        const normalizedAlias = normalizeAlias(parsed.alias)
        const sanitized: AuthUser = {
          alias: normalizedAlias,
          email: parsed.email ?? `${normalizedAlias}@microsoft.com`,
          name: parsed.name ?? normalizedAlias,
          logos: Array.isArray(parsed.logos) ? parsed.logos : [],
          role: parsed.role === 'admin' ? 'admin' : 'member',
          source: parsed.source === 'admin' ? 'admin' : 'alias',
          hasPassword: Boolean(parsed.hasPassword),
        }
        setUser(sanitized)
      }
    } catch (error) {
      console.warn('Failed to parse stored auth user', error)
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const persistUser = useCallback((next: AuthUser | null) => {
    if (typeof window === 'undefined') return
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const ensureAllowedUsers = useCallback(async () => {
    if (allowedUsersRef.current) {
      return allowedUsersRef.current
    }

    const records = await fetchAllowedUsers()
    allowedUsersRef.current = records
    return records
  }, [])

  const loginWithAlias = useCallback<AuthContextValue['loginWithAlias']>(
    async ({ alias, password }) => {
      setLoading(true)
      setDeniedReason(null)

      try {
        const records = await ensureAllowedUsers()
        const normalizedAlias = normalizeAlias(alias)

        const record = records.find((entry) => {
          const aliasMatch = normalizeAlias(entry.alias) === normalizedAlias
          const emailMatch = entry.email
            ? normalizeAlias(entry.email) === normalizedAlias
            : false
          return aliasMatch || emailMatch
        })

        if (!record) {
          setDeniedReason('alias-not-found')
          return { status: 'error', reason: 'alias-not-found' }
        }

        if (record.passwordHash) {
          if (!password) {
            setDeniedReason('password-required')
            return { status: 'password-required', alias: normalizedAlias }
          }

          const attemptHash = await hashPasswordWithAlias(password, normalizedAlias)
          if (attemptHash !== record.passwordHash) {
            setDeniedReason('password-invalid')
            return { status: 'error', reason: 'password-invalid' }
          }
        }

        const authUser = toAuthUser(record, normalizedAlias, 'alias')
        setUser(authUser)
        persistUser(authUser)
        return { status: 'success', user: authUser }
      } catch (error) {
        console.error('Alias login failed', error)
        setDeniedReason('network-error')
        return { status: 'error', reason: 'network-error' }
      } finally {
        setLoading(false)
      }
    },
    [ensureAllowedUsers, persistUser],
  )

  const logout = useCallback(() => {
    setUser(null)
    persistUser(null)
    setDeniedReason(null)
  }, [persistUser])

  const clearDeniedReason = useCallback(() => {
    setDeniedReason(null)
  }, [])

  const refreshRoster = useCallback(async () => {
    allowedUsersRef.current = null
    const records = await ensureAllowedUsers()

    if (!user) {
      return
    }

    const normalizedAlias = normalizeAlias(user.alias)
    const record = records.find((entry) => {
      const aliasMatch = normalizeAlias(entry.alias) === normalizedAlias
      const emailMatch = entry.email
        ? normalizeAlias(entry.email) === normalizedAlias
        : false
      return aliasMatch || emailMatch
    })

    if (record) {
      const refreshedUser = toAuthUser(record, normalizedAlias, user.source)
      setUser(refreshedUser)
      persistUser(refreshedUser)
    }
  }, [ensureAllowedUsers, persistUser, user])

  const value = useMemo<AuthContextValue>(() => {
    const isAuthenticated = Boolean(user)
    const isAdmin = user?.role === 'admin'

    return {
      user,
      isAuthenticated,
      isAllowed: isAuthenticated,
      isAdmin,
      loading,
      deniedReason,
      loginWithAlias,
      logout,
      clearDeniedReason,
      refreshRoster,
    }
  }, [user, loading, deniedReason, loginWithAlias, logout, clearDeniedReason, refreshRoster])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
