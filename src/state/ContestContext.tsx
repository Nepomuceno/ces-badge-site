import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { ContestStatus, ContestWithMetrics } from '../lib/contest-utils'

interface ContestSummary extends ContestWithMetrics {
  isActive: boolean
}

function normalizeContestSummary(contest: ContestSummary): ContestSummary {
  return {
    ...contest,
    leaderboard: Array.isArray(contest.leaderboard) ? contest.leaderboard : [],
    lastMatchAt: contest.lastMatchAt ?? null,
    championInsights: contest.championInsights ?? null,
  }
}

interface ContestCreateInput {
  title: string
  slug?: string
  subtitle?: string | null
  description?: string | null
  status?: ContestStatus
  startsAt?: string | null
  endsAt?: string | null
  votingOpen?: boolean
  setActive?: boolean
}

interface ContestUpdateInput extends Partial<ContestCreateInput> {
  archivedAt?: string | null
}

interface ContestContextValue {
  contests: ContestSummary[]
  activeContestId: string | null
  selectedContestId: string | null
  activeContest: ContestSummary | null
  selectedContest: ContestSummary | null
  liveContest: ContestSummary | null
  hasLiveContest: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  selectContest: (contestId: string) => void
  setActiveContest: (contestId: string) => Promise<void>
  createContest: (input: ContestCreateInput) => Promise<ContestSummary | null>
  updateContest: (contestId: string, input: ContestUpdateInput) => Promise<ContestSummary | null>
  resetContestVotes: (contestId: string) => Promise<ContestSummary | null>
  recalculateContestElo: (
    contestId: string,
    options?: { dryRun?: boolean },
  ) => Promise<ContestEloRecalculationResponse>
}

export interface ContestEloRecalculationDifference {
  logoId: string
  logoName: string
  logoCodename: string
  ratingBefore: number
  ratingAfter: number
  ratingDelta: number
  winsBefore: number
  winsAfter: number
  lossesBefore: number
  lossesAfter: number
  matchesBefore: number
  matchesAfter: number
  matchesDelta: number
}

export interface ContestEloRecalculationSummary {
  totalMatches: number
  changedCount: number
  changesDetected: boolean
  lastMatchAt: string | null
}

export interface ContestEloRecalculationResponse {
  dryRun: boolean
  applied: boolean
  message: string
  summary: ContestEloRecalculationSummary
  differences: ContestEloRecalculationDifference[]
  proposedLeaderboard: ContestSummary['leaderboard']
  contest?: ContestSummary
}

const STORAGE_KEY = 'ces3-current-contest'

const ContestContext = createContext<ContestContextValue | undefined>(undefined)

interface ContestsResponse {
  activeContestId?: string | null
  contests?: ContestSummary[]
}

interface ContestResponse {
  contest?: ContestSummary
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    let message = response.statusText
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) {
        message = payload.message
      }
    } catch (error) {
      // ignore
    }
    throw new Error(message || 'Request failed')
  }
  return (await response.json()) as T
}

export function ContestProvider({ children }: { children: ReactNode }) {
  const [contests, setContests] = useState<ContestSummary[]>([])
  const [activeContestId, setActiveContestId] = useState<string | null>(null)
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ensureSelectedContest = useCallback(
    (nextContests: ContestSummary[], nextActive: string | null, currentSelected: string | null) => {
      if (nextContests.length === 0) {
        return null
      }

      const selectedExists = currentSelected
        ? nextContests.some((contest) => contest.id === currentSelected)
        : false

      if (selectedExists) {
        return currentSelected
      }

      if (nextActive && nextContests.some((contest) => contest.id === nextActive)) {
        return nextActive
      }

      return nextContests[0]!.id
    },
    [],
  )

  const loadContests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJson<ContestsResponse>('/api/contests', {
        headers: {
          Accept: 'application/json',
        },
      })
      const nextContests = Array.isArray(data.contests) ? data.contests : []
      const sanitizedContests = nextContests.map(normalizeContestSummary)
      const nextActive = data.activeContestId ?? null
      setContests(sanitizedContests)
      setActiveContestId(nextActive)
      setSelectedContestId((prev) => {
        const persisted = prev ?? (typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null)
        const resolved = ensureSelectedContest(sanitizedContests, nextActive, persisted)
        if (typeof window !== 'undefined' && resolved) {
          window.localStorage.setItem(STORAGE_KEY, resolved)
        }
        return resolved
      })
    } catch (error) {
      console.error('Failed to load contests', error)
      setError(error instanceof Error ? error.message : 'Failed to load contests')
    } finally {
      setLoading(false)
    }
  }, [ensureSelectedContest])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await loadContests()
      if (cancelled) return
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored) {
          setSelectedContestId((prev) => prev ?? stored)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadContests])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (selectedContestId) {
      window.localStorage.setItem(STORAGE_KEY, selectedContestId)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [selectedContestId])

  const refresh = useCallback(async () => {
    await loadContests()
  }, [loadContests])

  const selectContest = useCallback(
    (contestId: string) => {
      setSelectedContestId((prev) => {
        const exists = contests.some((contest) => contest.id === contestId)
        return exists ? contestId : prev
      })
    },
    [contests],
  )

  const setActiveContest = useCallback(async (contestId: string) => {
    const updated = await fetchJson<ContestResponse>(`/api/contests/${encodeURIComponent(contestId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ setActive: true }),
    })

    if (updated.contest) {
      const normalized = normalizeContestSummary(updated.contest)
      setContests((prev) => {
        const filtered = prev.filter((entry) => entry.id !== normalized.id)
        return [...filtered, normalized].sort((a, b) => a.title.localeCompare(b.title))
      })
      setActiveContestId(normalized.id)
      setSelectedContestId(normalized.id)
    }
  }, [])

  const createContest = useCallback<ContestContextValue['createContest']>(async (input) => {
    try {
      const payload: ContestCreateInput = {
        title: input.title,
        slug: input.slug,
        subtitle: input.subtitle,
        description: input.description,
        status: input.status,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        votingOpen: input.votingOpen,
        setActive: input.setActive,
      }

      const data = await fetchJson<ContestResponse>('/api/contests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (data.contest) {
        const normalized = normalizeContestSummary(data.contest)
        setContests((prev) => {
          const filtered = prev.filter((entry) => entry.id !== normalized.id)
          return [...filtered, normalized].sort((a, b) => a.title.localeCompare(b.title))
        })
        if (normalized.isActive) {
          setActiveContestId(normalized.id)
          setSelectedContestId(normalized.id)
        }
        return normalized
      }

      return null
    } catch (error) {
      console.error('Failed to create contest', error)
      throw error
    }
  }, [])

  const updateContestMutation = useCallback<ContestContextValue['updateContest']>(
    async (contestId, input) => {
      try {
        const payload: ContestUpdateInput = { ...input }
        const data = await fetchJson<ContestResponse>(`/api/contests/${encodeURIComponent(contestId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (data.contest) {
          const normalized = normalizeContestSummary(data.contest)
          setContests((prev) => {
            const filtered = prev.filter((entry) => entry.id !== normalized.id)
            return [...filtered, normalized].sort((a, b) => a.title.localeCompare(b.title))
          })

          if (normalized.isActive) {
            setActiveContestId(normalized.id)
            setSelectedContestId((current) => current ?? normalized.id)
          }

          return normalized
        }

        return null
      } catch (error) {
        console.error('Failed to update contest', error)
        throw error
      }
    },
    [],
  )

  const resetContestVotesMutation = useCallback<ContestContextValue['resetContestVotes']>(
    async (contestId) => {
      const data = await fetchJson<ContestResponse>(
        `/api/contests/${encodeURIComponent(contestId)}/reset`,
        {
          method: 'POST',
        },
      )

      if (data.contest) {
        const normalized = normalizeContestSummary(data.contest)
        setContests((prev) => {
          const filtered = prev.filter((entry) => entry.id !== normalized.id)
          return [...filtered, normalized].sort((a, b) => a.title.localeCompare(b.title))
        })
        if (normalized.isActive) {
          setActiveContestId(normalized.id)
        }
        return normalized
      }

      return null
    },
    [],
  )

  const recalculateContestElo = useCallback<ContestContextValue['recalculateContestElo']>(
    async (contestId, options) => {
      const payload = {
        dryRun: options?.dryRun ?? false,
      }

      const data = await fetchJson<ContestEloRecalculationResponse>(
        `/api/contests/${encodeURIComponent(contestId)}/recalculate-elo`,
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        },
      )

      const normalizedContest = data.contest ? normalizeContestSummary(data.contest) : undefined

      if (!data.dryRun && normalizedContest) {
        setContests((prev) => {
          const filtered = prev.filter((entry) => entry.id !== normalizedContest.id)
          return [...filtered, normalizedContest].sort((a, b) => a.title.localeCompare(b.title))
        })

        if (normalizedContest.isActive) {
          setActiveContestId(normalizedContest.id)
        }
      }

      return {
        ...data,
        contest: normalizedContest,
      }
    },
    [],
  )

  const { activeContest, selectedContest } = useMemo(() => {
    const active = activeContestId ? contests.find((contest) => contest.id === activeContestId) ?? null : null
    const selected = selectedContestId
      ? contests.find((contest) => contest.id === selectedContestId) ?? active
      : active
    return { activeContest: active, selectedContest: selected }
  }, [activeContestId, contests, selectedContestId])

  const liveContest = activeContest && activeContest.isActive && activeContest.votingOpen ? activeContest : null
  const hasLiveContest = Boolean(liveContest)

  const value = useMemo<ContestContextValue>(
    () => ({
      contests: [...contests].sort((a, b) => a.title.localeCompare(b.title)),
      activeContestId,
      selectedContestId,
      activeContest,
      selectedContest,
      liveContest,
      hasLiveContest,
      loading,
      error,
      refresh,
      selectContest,
      setActiveContest,
      createContest,
      updateContest: updateContestMutation,
      resetContestVotes: resetContestVotesMutation,
      recalculateContestElo,
    }),
    [
      activeContest,
      activeContestId,
      contests,
      createContest,
      error,
      loading,
      recalculateContestElo,
      refresh,
      selectContest,
      selectedContest,
      selectedContestId,
      setActiveContest,
      updateContestMutation,
      resetContestVotesMutation,
      liveContest,
      hasLiveContest,
    ],
  )

  return <ContestContext.Provider value={value}>{children}</ContestContext.Provider>
}

export function useContest() {
  const context = useContext(ContestContext)
  if (!context) {
    throw new Error('useContest must be used within a ContestProvider')
  }
  return context
}
