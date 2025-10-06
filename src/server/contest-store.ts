import { promises as fs } from 'node:fs'

import {
  DEFAULT_CONTEST_DESCRIPTION,
  DEFAULT_CONTEST_ID,
  DEFAULT_CONTEST_SLUG,
  DEFAULT_CONTEST_SUBTITLE,
  DEFAULT_CONTEST_TITLE,
  sanitizeContestSlug,
  sanitizeContestTitle,
  type Contest,
  type ContestStatus,
} from '../lib/contest-utils'
import { ensureDataDir, resolveDataPath } from './storage-utils'

const CONTESTS_FILE = 'contests.json'

interface ContestRegistryFile {
  version: number
  activeContestId: string
  contests: Contest[]
  updatedAt: string
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
}

interface ContestUpdateInput {
  title?: string
  slug?: string
  subtitle?: string | null
  description?: string | null
  status?: ContestStatus
  startsAt?: string | null
  endsAt?: string | null
  archivedAt?: string | null
  votingOpen?: boolean
  setActive?: boolean
}

function sanitizeIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const timestamp = Date.parse(trimmed)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function sanitizeStatus(value: ContestStatus | null | undefined): ContestStatus {
  switch (value) {
    case 'draft':
    case 'upcoming':
    case 'active':
    case 'archived':
      return value
    default:
      return 'draft'
  }
}

async function readContestRegistry(): Promise<ContestRegistryFile> {
  await ensureDataDir()
  const filePath = resolveDataPath(CONTESTS_FILE)

  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ContestRegistryFile>
    const contests = Array.isArray(parsed.contests) ? parsed.contests : []
    if (contests.length > 0 && parsed.activeContestId) {
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        activeContestId: parsed.activeContestId,
        contests: contests.map(normalizeContestRecord),
        updatedAt: sanitizeIso(parsed.updatedAt),
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') {
        console.warn('Failed to read contests registry, regenerating seed.', error)
      }
    } else {
      console.warn('Failed to read contests registry, regenerating seed.', error)
    }
  }

  const seeded: ContestRegistryFile = {
    version: 1,
    activeContestId: DEFAULT_CONTEST_ID,
    contests: [createDefaultContest()],
    updatedAt: new Date().toISOString(),
  }

  await writeContestRegistry(seeded)
  return seeded
}

function sanitizeIso(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }
  return new Date().toISOString()
}

function normalizeContestRecord(value: Partial<Contest> & { id?: string }): Contest {
  const createdAt = sanitizeIso(value.createdAt)
  const updatedAt = sanitizeIso(value.updatedAt ?? createdAt)
  const slug = sanitizeContestSlug(value.slug ?? value.id ?? DEFAULT_CONTEST_SLUG)
  const id = value.id || slug || DEFAULT_CONTEST_ID

  return {
    id,
    slug: slug || id,
    title: sanitizeContestTitle(value.title ?? DEFAULT_CONTEST_TITLE),
    subtitle: value.subtitle ?? null,
    description: value.description ?? null,
    status: sanitizeStatus(value.status),
    createdAt,
    updatedAt,
    startsAt: sanitizeIsoDate(value.startsAt),
    endsAt: sanitizeIsoDate(value.endsAt),
    archivedAt: sanitizeIsoDate(value.archivedAt),
    votingOpen: value.votingOpen ?? true,
  }
}

function createDefaultContest(): Contest {
  const now = new Date().toISOString()
  return {
    id: DEFAULT_CONTEST_ID,
    slug: DEFAULT_CONTEST_SLUG,
    title: DEFAULT_CONTEST_TITLE,
    subtitle: DEFAULT_CONTEST_SUBTITLE,
    description: DEFAULT_CONTEST_DESCRIPTION,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    startsAt: now,
    endsAt: null,
    archivedAt: null,
    votingOpen: true,
  }
}

async function writeContestRegistry(schema: ContestRegistryFile) {
  await ensureDataDir()
  const filePath = resolveDataPath(CONTESTS_FILE)
  const payload: ContestRegistryFile = {
    ...schema,
    contests: schema.contests.map(normalizeContestRecord),
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

export async function getContestRegistry(): Promise<ContestRegistryFile> {
  return readContestRegistry()
}

export async function getContests(): Promise<Contest[]> {
  const registry = await readContestRegistry()
  return registry.contests
}

export async function getContestById(id: string): Promise<Contest | null> {
  const registry = await readContestRegistry()
  const contest = registry.contests.find((entry) => entry.id === id)
  return contest ? normalizeContestRecord(contest) : null
}

export async function ensureContest(id: string): Promise<Contest> {
  const contest = await getContestById(id)
  if (!contest) {
    throw new Error(`Contest ${id} not found.`)
  }
  return contest
}

export async function getActiveContestId(): Promise<string> {
  const registry = await readContestRegistry()
  return registry.activeContestId
}

export async function getActiveContest(): Promise<Contest> {
  const registry = await readContestRegistry()
  const contest = registry.contests.find((entry) => entry.id === registry.activeContestId)
  if (contest) {
    return normalizeContestRecord(contest)
  }

  if (registry.contests.length === 0) {
    const seeded = await readContestRegistry()
    return seeded.contests[0]
  }

  return normalizeContestRecord(registry.contests[0]!)
}

function generateContestId(baseSlug: string, existing: Set<string>): string {
  let candidate = baseSlug
  let index = 2
  while (existing.has(candidate)) {
    candidate = `${baseSlug}-${index}`
    index += 1
  }
  return candidate
}

export async function createContest(input: ContestCreateInput): Promise<Contest> {
  const registry = await readContestRegistry()
  const nextContests = [...registry.contests]
  const existingIds = new Set(nextContests.map((entry) => entry.id))

  const title = sanitizeContestTitle(input.title)
  const slugRaw = input.slug ? sanitizeContestSlug(input.slug) : sanitizeContestSlug(title)
  const contestId = generateContestId(slugRaw || `contest-${nextContests.length + 1}`, existingIds)

  const timestamp = new Date().toISOString()
  const contest: Contest = normalizeContestRecord({
    id: contestId,
    slug: slugRaw || contestId,
    title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    status: sanitizeStatus(input.status ?? 'draft'),
    createdAt: timestamp,
    updatedAt: timestamp,
    startsAt: sanitizeIsoDate(input.startsAt),
    endsAt: sanitizeIsoDate(input.endsAt),
    archivedAt: null,
    votingOpen: input.votingOpen ?? false,
  })

  nextContests.push(contest)

  const nextRegistry: ContestRegistryFile = {
    ...registry,
    contests: nextContests,
    updatedAt: timestamp,
  }

  if (contest.status === 'active' || registry.contests.length === 0) {
    nextRegistry.activeContestId = contest.id
    nextRegistry.contests = nextContests.map((entry) =>
      entry.id === contest.id ? { ...entry, status: 'active' } : entry,
    )
  }

  await writeContestRegistry(nextRegistry)
  return contest
}

export async function updateContest(id: string, updates: ContestUpdateInput): Promise<Contest> {
  const registry = await readContestRegistry()
  const index = registry.contests.findIndex((entry) => entry.id === id)
  if (index === -1) {
    throw new Error('Contest not found.')
  }

  const current = registry.contests[index]!
  const timestamp = new Date().toISOString()

  const nextSlug = updates.slug ? sanitizeContestSlug(updates.slug) : current.slug
  const nextTitle = updates.title ? sanitizeContestTitle(updates.title) : current.title
  const nextStatus = updates.status ? sanitizeStatus(updates.status) : current.status
  const nextStartsAt =
    updates.startsAt !== undefined ? sanitizeIsoDate(updates.startsAt) : current.startsAt
  const nextEndsAt = updates.endsAt !== undefined ? sanitizeIsoDate(updates.endsAt) : current.endsAt
  const nextArchivedAt =
    updates.archivedAt !== undefined ? sanitizeIsoDate(updates.archivedAt) : current.archivedAt

  const nextContest: Contest = normalizeContestRecord({
    ...current,
    slug: nextSlug,
    title: nextTitle,
    subtitle: updates.subtitle !== undefined ? updates.subtitle : current.subtitle,
    description: updates.description !== undefined ? updates.description : current.description,
    status: nextStatus,
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    archivedAt: nextArchivedAt,
    updatedAt: timestamp,
    votingOpen: updates.votingOpen !== undefined ? Boolean(updates.votingOpen) : current.votingOpen,
  })

  const nextRegistry: ContestRegistryFile = {
    ...registry,
    contests: registry.contests.map((entry, idx) => (idx === index ? nextContest : entry)),
    updatedAt: timestamp,
    activeContestId: registry.activeContestId,
  }

  if (updates.setActive || nextStatus === 'active') {
    nextRegistry.activeContestId = nextContest.id
    nextRegistry.contests = nextRegistry.contests.map((entry) =>
      entry.id === nextContest.id
        ? { ...entry, status: 'active' }
        : entry.id === registry.activeContestId
          ? { ...entry, status: entry.status === 'archived' ? 'archived' : 'upcoming' }
          : entry,
    )
  } else if (registry.activeContestId === nextContest.id && nextContest.status !== 'active') {
    const fallback = nextRegistry.contests.find((entry) => entry.status === 'active')
    if (fallback) {
      nextRegistry.activeContestId = fallback.id
    } else {
      const firstContest = nextRegistry.contests[0]
      if (firstContest) {
        nextRegistry.activeContestId = firstContest.id
        nextRegistry.contests = nextRegistry.contests.map((entry, idx) =>
          idx === 0 ? { ...entry, status: 'active' } : entry,
        )
      }
    }
  }

  await writeContestRegistry(nextRegistry)
  return nextContest
}

export async function setActiveContest(id: string): Promise<Contest> {
  await ensureContest(id)
  return updateContest(id, { status: 'active', setActive: true })
}
