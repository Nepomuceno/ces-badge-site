import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'ces3-logo-favorites::'

interface FavoritesContextValue {
  favorites: Set<string>
  toggleFavorite: (logoId: string) => void
  isFavorite: (logoId: string) => boolean
  clearFavorites: () => void
  identityKey: string
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(
  undefined,
)

function loadFromStorage(identityKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${identityKey}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed)
  } catch (error) {
    console.warn('Failed to read favorites from storage', error)
    return new Set()
  }
}

function persistFavorites(identityKey: string, favorites: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${identityKey}`,
      JSON.stringify(Array.from(favorites)),
    )
  } catch (error) {
    console.warn('Failed to persist favorites', error)
  }
}

export function FavoritesProvider({
  children,
  identityKey = 'anonymous',
}: {
  children: React.ReactNode
  identityKey?: string
}) {
  const [favorites, setFavorites] = useState<Set<string>>(() =>
    loadFromStorage(identityKey.toLowerCase()),
  )

  useEffect(() => {
    setFavorites(loadFromStorage(identityKey.toLowerCase()))
  }, [identityKey])

  useEffect(() => {
    persistFavorites(identityKey.toLowerCase(), favorites)
  }, [favorites, identityKey])

  const value = useMemo<FavoritesContextValue>(() => {
    const lowerIdentity = identityKey.toLowerCase()
    return {
      favorites,
      identityKey: lowerIdentity,
      toggleFavorite: (logoId: string) => {
        setFavorites((prev) => {
          const next = new Set(prev)
          if (next.has(logoId)) {
            next.delete(logoId)
          } else {
            next.add(logoId)
          }
          return next
        })
      },
      isFavorite: (logoId: string) => favorites.has(logoId),
      clearFavorites: () => setFavorites(new Set()),
    }
  }, [favorites, identityKey])

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider')
  }
  return context
}
