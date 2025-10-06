export type ContestStatus = 'draft' | 'upcoming' | 'active' | 'archived'

export interface Contest {
  id: string
  slug: string
  title: string
  subtitle?: string | null
  description?: string | null
  status: ContestStatus
  createdAt: string
  updatedAt: string
  startsAt?: string | null
  endsAt?: string | null
  archivedAt?: string | null
  votingOpen: boolean
}

export interface ContestLeaderboardEntry {
  logoId: string
  logoName: string
  logoCodename: string
  logoImage: string
  rating: number
  wins: number
  losses: number
  matches: number
}

export interface ContestWithMetrics extends Contest {
  logoCount: number
  matchCount: number
  leaderboard: ContestLeaderboardEntry[]
  lastMatchAt: string | null
}

export const DEFAULT_CONTEST_ID = 'badge-arena'
export const DEFAULT_CONTEST_SLUG = 'badge-arena'
export const DEFAULT_CONTEST_TITLE = 'CES3 Badge Arena'
export const DEFAULT_CONTEST_SUBTITLE = 'Vote · Battle · Choose'
export const DEFAULT_CONTEST_DESCRIPTION =
  'Vote on the strongest CES3 identity marks, track standings, and crown a champion badge.'

export function isContestActive(status: ContestStatus): boolean {
  return status === 'active'
}

export function sanitizeContestTitle(value: string): string {
  return value.trim()
}

export function sanitizeContestSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
