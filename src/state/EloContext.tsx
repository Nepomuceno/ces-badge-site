import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  createEmptyEntry,
  ensureEntries,
  produceMatchup,
  type EloEntry,
  type EloState,
  type MatchHistoryEntry,
  type Matchup,
} from '../lib/elo-engine'
import { type LogoEntry } from '../lib/logo-utils'
import { useLogoLibrary } from './LogoLibraryContext'
import { useContest } from './ContestContext'

interface EloContextValue {
  ratings: Record<string, EloEntry>
  rankings: Array<{ logo: LogoEntry; entry: EloEntry; rank: number }>
  recentHistory: MatchHistoryEntry[]
  currentMatchup: Matchup | null
  selectWinner: (winnerId: string, loserId: string, voterHash: string | null) => Promise<void>
  skipMatchup: () => void
}

const EloContext = createContext<EloContextValue | undefined>(undefined)

const EMPTY_STATE: EloState = {
  entries: {},
  history: [],
}

function buildLogosKey(logos: LogoEntry[]): string {
  return logos
    .map((logo) => logo.id)
    .sort()
    .join('|')
}

export function EloProvider({ children }: { children: React.ReactNode }) {
  const { logos } = useLogoLibrary()
  const { liveContest } = useContest()
  const contestId = liveContest?.id ?? null
  const [state, setState] = useState<EloState>(EMPTY_STATE)
  const [currentMatchup, setCurrentMatchup] = useState<Matchup | null>(null)

  const logosKey = useMemo(() => buildLogosKey(logos), [logos])

  useEffect(() => {
    setState(EMPTY_STATE)
    setCurrentMatchup(null)
  }, [contestId])

  useEffect(() => {
    setState((prev) => {
      const ensured = ensureEntries(prev, logos)
      if (ensured === prev) {
        return prev
      }
      setCurrentMatchup(logos.length >= 2 ? produceMatchup(logos, ensured.entries) : null)
      return ensured
    })
  }, [logos])

  useEffect(() => {
    if (!contestId) {
      const ensured = ensureEntries(EMPTY_STATE, logos)
      setState(ensured)
      setCurrentMatchup(logos.length >= 2 ? produceMatchup(logos, ensured.entries) : null)
      return
    }

    if (logos.length === 0) {
      setCurrentMatchup(null)
      return
    }

    let cancelled = false
    const activeContestId = contestId

    async function loadVotes(currentContestId: string) {
      try {
        const query = `contestId=${encodeURIComponent(currentContestId)}`
        const response = await fetch(`/api/votes?${query}`, {
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to load vote state (${response.status})`)
        }

        const data = (await response.json()) as { state?: EloState }
        const rawState = data.state ?? EMPTY_STATE
        const ensured = ensureEntries(rawState, logos)

        if (!cancelled) {
          setState(ensured)
          setCurrentMatchup(logos.length >= 2 ? produceMatchup(logos, ensured.entries) : null)
        }
      } catch (error) {
        console.error('Failed to load vote state', error)
        if (!cancelled) {
          const ensured = ensureEntries(EMPTY_STATE, logos)
          setState(ensured)
          setCurrentMatchup(logos.length >= 2 ? produceMatchup(logos, ensured.entries) : null)
        }
      }
    }

    void loadVotes(activeContestId)

    return () => {
      cancelled = true
    }
  }, [contestId, logosKey, logos])

  const selectWinner = useCallback(
    async (winnerId: string, loserId: string, voterHash: string | null) => {
      if (!contestId) {
        console.warn('No contest selected; skip recording vote.')
        return
      }
      const activeContestId = contestId
      try {
        const response = await fetch(`/api/votes?contestId=${encodeURIComponent(activeContestId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ winnerId, loserId, voterHash, contestId: activeContestId }),
        })

        if (!response.ok) {
          throw new Error(`Failed to record vote (${response.status})`)
        }

        const data = (await response.json()) as { state?: EloState }
        const rawState = data.state ?? EMPTY_STATE
        const ensured = ensureEntries(rawState, logos)
        setState(ensured)
        setCurrentMatchup(logos.length >= 2 ? produceMatchup(logos, ensured.entries) : null)
      } catch (error) {
        console.error('Failed to record vote', error)
      }
    },
    [contestId, logos],
  )

  const skipMatchup = useCallback(() => {
    setCurrentMatchup((previous) =>
      logos.length >= 2 ? produceMatchup(logos, state.entries, previous) : null,
    )
  }, [logos, state.entries])

  const rankings = useMemo(() => {
    return logos
      .map((logo) => ({ logo, entry: state.entries[logo.id] ?? createEmptyEntry() }))
      .sort((a, b) => b.entry.rating - a.entry.rating)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  }, [logos, state.entries])

  const value = useMemo<EloContextValue>(
    () => ({
      ratings: state.entries,
      rankings,
      recentHistory: state.history,
      currentMatchup,
      selectWinner,
      skipMatchup,
    }),
    [currentMatchup, rankings, selectWinner, skipMatchup, state.entries, state.history],
  )

  return <EloContext.Provider value={value}>{children}</EloContext.Provider>
}

export function useElo() {
  const context = useContext(EloContext)
  if (!context) {
    throw new Error('useElo must be used within an EloProvider')
  }
  return context
}
