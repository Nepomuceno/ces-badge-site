import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { logoCatalog } from '../data/logo-catalog'
import {
  createCatalogEntry,
  normalizeOwnerAlias,
  sortLogos,
  type LogoEntry,
  type SubmitLogoInput,
  type UpdateLogoInput,
} from '../lib/logo-utils'
import { useContest } from './ContestContext'

export type { LogoEntry, SubmitLogoInput, UpdateLogoInput } from '../lib/logo-utils'

const seedLogos = sortLogos(logoCatalog.map((logo) => createCatalogEntry(logo)))

interface LogoLibraryContextValue {
  contestId: string | null
  loading: boolean
  logos: LogoEntry[]
  allLogos: LogoEntry[]
  getLogoById: (id: string) => LogoEntry | undefined
  submitLogo: (input: SubmitLogoInput) => Promise<LogoEntry>
  assignOwner: (id: string, ownerAlias: string | null) => void
  updateLogoDetails: (id: string, updates: UpdateLogoInput) => Promise<LogoEntry>
  removeLogo: (id: string, removedBy: string | null) => Promise<void>
  getLogosSubmittedBy: (email: string, options?: { includeRemoved?: boolean }) => LogoEntry[]
  getLogosOwnedBy: (alias: string, options?: { includeRemoved?: boolean }) => LogoEntry[]
  refresh: () => Promise<void>
}

const LogoLibraryContext = createContext<LogoLibraryContextValue | undefined>(undefined)

async function readLogosFromServer(contestId: string, signal?: AbortSignal): Promise<LogoEntry[]> {
  const response = await fetch(`/api/logos?contestId=${encodeURIComponent(contestId)}`, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to load logos (${response.status})`)
  }

  const data = (await response.json()) as { logos?: LogoEntry[] }
  const entries = Array.isArray(data.logos) ? data.logos : []
  return sortLogos(entries)
}

export function LogoLibraryProvider({ children }: { children: ReactNode }) {
  const { liveContest } = useContest()
  const contestId = liveContest?.id ?? null

  const [allLogos, setAllLogos] = useState<LogoEntry[]>(seedLogos)
  const [loading, setLoading] = useState(false)

  const fetchAndStoreLogos = useCallback(
    async (targetContestId: string, signal?: AbortSignal) => {
      const entries = await readLogosFromServer(targetContestId, signal)
      setAllLogos(entries)
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    if (!contestId) {
      setAllLogos([])
      setLoading(false)
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    setLoading(true)

    fetchAndStoreLogos(contestId, controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load logos from server', error)
        if (!cancelled) {
          setAllLogos([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [contestId, fetchAndStoreLogos])

  const logos = useMemo(() => allLogos.filter((logo) => !logo.removedAt), [allLogos])

  const getLogoById = useCallback(
    (id: string) => logos.find((logo) => logo.id === id),
    [logos],
  )

  const refresh = useCallback(async () => {
    if (!contestId) {
      setAllLogos([])
      return
    }

    setLoading(true)
    try {
      await fetchAndStoreLogos(contestId)
    } catch (error) {
      console.error('Failed to refresh logos', error)
      setAllLogos([])
      throw error
    } finally {
      setLoading(false)
    }
  }, [contestId, fetchAndStoreLogos])

  const submitLogo = useCallback(
    async (input: SubmitLogoInput): Promise<LogoEntry> => {
      if (!contestId) {
        throw new Error('No contest selected for submission.')
      }

      const response = await fetch('/api/logos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...input, contestId: input.contestId ?? contestId }),
      })

      if (!response.ok) {
        throw new Error(`Failed to submit logo (${response.status})`)
      }

      const data = (await response.json()) as { logo?: LogoEntry }
      if (!data.logo) {
        throw new Error('Server did not return a logo entry.')
      }

      setAllLogos((prev) => {
        const filtered = prev.filter((logo) => logo.id !== data.logo!.id)
        return sortLogos([...filtered, data.logo!])
      })

      return data.logo
    },
    [contestId],
  )

  const updateLogoDetails = useCallback(
    async (id: string, updates: UpdateLogoInput): Promise<LogoEntry> => {
      if (!contestId) {
        throw new Error('No contest selected while updating logo.')
      }

      const response = await fetch(
        `/api/logos/${encodeURIComponent(id)}?contestId=${encodeURIComponent(contestId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        },
      )

      const rawBody = await response.text()
      let payload: { logo?: LogoEntry; message?: string } = {}
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as { logo?: LogoEntry; message?: string }
        } catch (error) {
          console.warn('Failed to parse logo update response payload.', error)
        }
      }

      if (!response.ok) {
        throw new Error(payload.message ?? `Failed to update logo (${response.status})`)
      }

      if (!payload.logo) {
        throw new Error('Server did not return an updated logo entry.')
      }

      setAllLogos((prev) => {
        const next = prev.map((logo) => (logo.id === payload.logo!.id ? payload.logo! : logo))
        return sortLogos(next)
      })

      return payload.logo
    },
    [contestId],
  )

  const assignOwner = useCallback(
    (id: string, ownerAlias: string | null) => {
      void updateLogoDetails(id, { ownerAlias }).catch((error) => {
        console.error('Failed to update logo owner', error)
      })
    },
    [updateLogoDetails],
  )

  const removeLogo = useCallback(
    async (id: string, removedBy: string | null) => {
      if (!contestId) {
        throw new Error('No contest selected.')
      }

      const response = await fetch(
        `/api/logos/${encodeURIComponent(id)}?contestId=${encodeURIComponent(contestId)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ removedBy }),
        },
      )

      if (!response.ok) {
        throw new Error(`Failed to remove logo (${response.status})`)
      }

      const data = (await response.json()) as { logo?: LogoEntry }
      if (!data.logo) {
        throw new Error('Server did not return an updated logo entry.')
      }

      setAllLogos((prev) => {
        const next = prev.map((logo) => (logo.id === data.logo!.id ? data.logo! : logo))
        return sortLogos(next)
      })
    },
    [contestId],
  )

  const getLogosSubmittedBy = useCallback(
    (email: string, options?: { includeRemoved?: boolean }) => {
      const normalized = email.toLowerCase()
      return (options?.includeRemoved ? allLogos : logos).filter(
        (logo) => logo.submittedBy?.toLowerCase() === normalized,
      )
    },
    [allLogos, logos],
  )

  const getLogosOwnedBy = useCallback(
    (alias: string, options?: { includeRemoved?: boolean }) => {
      const normalized = normalizeOwnerAlias(alias)
      if (!normalized) {
        return []
      }
      const catalog = options?.includeRemoved ? allLogos : logos
      return catalog.filter((logo) => logo.ownerAlias === normalized)
    },
    [allLogos, logos],
  )

  const value = useMemo<LogoLibraryContextValue>(
    () => ({
      contestId,
      loading,
      logos,
      allLogos,
      getLogoById,
      submitLogo,
      assignOwner,
      updateLogoDetails,
      removeLogo,
      getLogosSubmittedBy,
      getLogosOwnedBy,
      refresh,
    }),
    [
      allLogos,
      assignOwner,
      contestId,
      getLogoById,
      getLogosOwnedBy,
      getLogosSubmittedBy,
      loading,
      logos,
      updateLogoDetails,
      refresh,
      removeLogo,
      submitLogo,
    ],
  )

  return <LogoLibraryContext.Provider value={value}>{children}</LogoLibraryContext.Provider>
}

export function useLogoLibrary() {
  const context = useContext(LogoLibraryContext)
  if (!context) {
    throw new Error('useLogoLibrary must be used within a LogoLibraryProvider')
  }
  return context
}
