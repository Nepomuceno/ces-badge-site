import type { LogoEntry } from './logo-utils'

export const DEFAULT_RATING = 1500
export const K_FACTOR = 32
export const HISTORY_LIMIT = 1000

export interface EloEntry {
  rating: number
  wins: number
  losses: number
  matches: number
}

export interface MatchHistoryEntry {
  winnerId: string
  loserId: string
  timestamp: number
  voterHash: string | null
}

export interface EloState {
  entries: Record<string, EloEntry>
  history: MatchHistoryEntry[]
}

export interface Matchup {
  primary: LogoEntry
  challenger: LogoEntry
}

function createPairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export function normalizeVoterHash(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function createEmptyEntry(): EloEntry {
  return {
    rating: DEFAULT_RATING,
    wins: 0,
    losses: 0,
    matches: 0,
  }
}

function coerceEntry(value: unknown): EloEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const rating = Number(record.rating)
  const wins = Number(record.wins)
  const losses = Number(record.losses)
  const matches = Number(record.matches)

  if (Number.isNaN(rating) || Number.isNaN(wins) || Number.isNaN(losses) || Number.isNaN(matches)) {
    return null
  }

  return {
    rating,
    wins,
    losses,
    matches,
  }
}

function sanitizeHistory(value: unknown): MatchHistoryEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: MatchHistoryEntry[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const record = entry as Record<string, unknown>
    const winnerId = typeof record.winnerId === 'string' ? record.winnerId : null
    const loserId = typeof record.loserId === 'string' ? record.loserId : null
    const timestamp =
      typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
        ? record.timestamp
        : null
    const rawHash =
      typeof record.voterHash === 'string' ? record.voterHash : null

    if (!winnerId || !loserId || timestamp === null) {
      continue
    }

    result.push({
      winnerId,
      loserId,
      timestamp,
      voterHash: normalizeVoterHash(rawHash),
    })
  }

  return result
}

export function parseEloState(value: unknown): EloState {
  if (!value || typeof value !== 'object') {
    return {
      entries: {},
      history: [],
    }
  }

  const record = value as Partial<EloState>
  const entriesRaw = record.entries ?? {}
  const entries: Record<string, EloEntry> = {}

  if (entriesRaw && typeof entriesRaw === 'object') {
    for (const [key, entry] of Object.entries(entriesRaw)) {
      const coerced = coerceEntry(entry)
      if (coerced) {
        entries[key] = coerced
      }
    }
  }

  return {
    entries,
    history: sanitizeHistory(record.history),
  }
}

export function ensureEntries(state: EloState, logos: LogoEntry[]): EloState {
  let mutated = false
  const nextEntries: Record<string, EloEntry> = { ...state.entries }

  for (const logo of logos) {
    if (!nextEntries[logo.id]) {
      mutated = true
      nextEntries[logo.id] = createEmptyEntry()
    }
  }

  if (!mutated) {
    return state
  }

  return {
    entries: nextEntries,
    history: state.history,
  }
}

export function pruneEntries(state: EloState, logos: LogoEntry[]): EloState {
  const activeIds = new Set(logos.map((logo) => logo.id))
  let mutated = false

  const nextEntries: Record<string, EloEntry> = {}
  for (const [logoId, entry] of Object.entries(state.entries)) {
    if (activeIds.has(logoId)) {
      nextEntries[logoId] = entry
    } else {
      mutated = true
    }
  }

  const nextHistory = state.history.filter((match) => {
    const keep = activeIds.has(match.winnerId) && activeIds.has(match.loserId)
    if (!keep) {
      mutated = true
    }
    return keep
  })

  if (!mutated) {
    return state
  }

  return {
    entries: nextEntries,
    history: nextHistory,
  }
}

function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function applyMatch(
  state: EloState,
  winnerId: string,
  loserId: string,
  voterHash: string | null,
): EloState {
  const winner = state.entries[winnerId] ?? createEmptyEntry()
  const loser = state.entries[loserId] ?? createEmptyEntry()

  const expectedWinner = expectedScore(winner.rating, loser.rating)
  const expectedLoser = expectedScore(loser.rating, winner.rating)

  const winnerRating = winner.rating + K_FACTOR * (1 - expectedWinner)
  const loserRating = loser.rating + K_FACTOR * (0 - expectedLoser)

  const entries: Record<string, EloEntry> = {
    ...state.entries,
    [winnerId]: {
      rating: winnerRating,
      wins: winner.wins + 1,
      losses: winner.losses,
      matches: winner.matches + 1,
    },
    [loserId]: {
      rating: loserRating,
      wins: loser.wins,
      losses: loser.losses + 1,
      matches: loser.matches + 1,
    },
  }

  const history: MatchHistoryEntry[] = [
    {
      winnerId,
      loserId,
      timestamp: Date.now(),
      voterHash: normalizeVoterHash(voterHash),
    },
    ...state.history,
  ].slice(0, HISTORY_LIMIT)

  return {
    entries,
    history,
  }
}

export function produceMatchup(
  logos: LogoEntry[],
  entries: Record<string, EloEntry>,
  previousMatchup: Matchup | null = null,
): Matchup | null {
  if (logos.length < 2) {
    return null
  }

  const avoidedKey = previousMatchup
    ? createPairKey(previousMatchup.primary.id, previousMatchup.challenger.id)
    : null

  const catalogEntries = logos.map((logo) => ({
    logo,
    entry: entries[logo.id] ?? createEmptyEntry(),
  }))

  const sortedByMatches = [...catalogEntries].sort((a, b) => {
    if (a.entry.matches === b.entry.matches) {
      return a.entry.rating - b.entry.rating
    }
    return a.entry.matches - b.entry.matches
  })

  let fallback: Matchup | null = null

  for (const primary of sortedByMatches) {
    const candidates = catalogEntries
      .filter((candidate) => candidate.logo.id !== primary.logo.id)
      .sort((a, b) => {
        const diffA = Math.abs(a.entry.rating - primary.entry.rating)
        const diffB = Math.abs(b.entry.rating - primary.entry.rating)
        if (diffA === diffB) {
          return a.entry.matches - b.entry.matches
        }
        return diffA - diffB
      })

    const firstCandidate = candidates[0]
    if (primary && firstCandidate && !fallback) {
      fallback = {
        primary: primary.logo,
        challenger: firstCandidate.logo,
      }
    }

    for (const candidate of candidates) {
      if (avoidedKey && createPairKey(primary.logo.id, candidate.logo.id) === avoidedKey) {
        continue
      }
      return {
        primary: primary.logo,
        challenger: candidate.logo,
      }
    }
  }

  return fallback
}
