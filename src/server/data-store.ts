import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { logoCatalog } from '../data/logo-catalog'
import {
  BASE_CATALOG_TIMESTAMP,
  type LogoEntry,
  type SubmitLogoInput,
  createCatalogEntry,
  generateCodename,
  normalizeOwnerAlias,
  sortLogos,
} from '../lib/logo-utils'
import {
  applyMatch,
  pruneEntries,
  ensureEntries,
  parseEloState,
  type EloState,
} from '../lib/elo-engine'
import { DEFAULT_CONTEST_ID } from '../lib/contest-utils'
import { ensureContest, getActiveContestId } from './contest-store'
import { ensureDataDir, resolveDataPath } from './storage-utils'

const LOGOS_FILE = 'logos.json'
const VOTES_FILE = 'votes.json'
const LOGO_SCHEMA_VERSION = 3
const VOTE_SCHEMA_VERSION = 2
const LOGO_ASSETS_DIR = 'logos'

interface LogosFileSchema {
  version: number
  logos: LogoEntry[]
  updatedAt: string
}

interface VotesFileContestState {
  state: EloState
  updatedAt: string
}

interface VotesFileSchema {
  version: number
  contests: Record<string, VotesFileContestState>
  updatedAt: string
}

interface SanitizedSubmitInput {
  name: string
  description?: string
  image: string
  submittedBy: string
  ownerAlias: string | null
}

const DATA_URL_REGEX = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/i

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function inferFileExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (MIME_EXTENSION_MAP[lower]) {
    return MIME_EXTENSION_MAP[lower]
  }
  if (lower.includes('svg')) {
    return 'svg'
  }
  if (lower.includes('png')) {
    return 'png'
  }
  if (lower.includes('jpeg') || lower.includes('jpg')) {
    return 'jpg'
  }
  if (lower.includes('webp')) {
    return 'webp'
  }
  return 'bin'
}

function buildLogoAssetFilename(logoId: string, extension: string): string {
  return `${logoId}.${extension}`
}

function buildLogoImageUrl(logoId: string, updatedAt: string): string {
  const timestamp = Date.parse(updatedAt)
  const version = Number.isNaN(timestamp) ? Date.now() : timestamp
  return `/api/logos/${encodeURIComponent(logoId)}/image?v=${version}`
}

function normalizeAssetPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\//, '')
  if (normalized.includes('..')) {
    return null
  }
  if (normalized.startsWith(`${LOGO_ASSETS_DIR}/`)) {
    return normalized
  }
  return `${LOGO_ASSETS_DIR}/${path.posix.basename(normalized)}`
}

async function persistLogoAssetFromDataUrl(logoId: string, dataUrl: string): Promise<{ assetPath: string; mimeType: string }> {
  const match = DATA_URL_REGEX.exec(dataUrl.trim())
  if (!match?.groups?.data) {
    throw new Error('Logo image must be a base64 data URL.')
  }

  const mimeType = (match.groups.mime ?? 'application/octet-stream').toLowerCase()
  const base64Payload = match.groups.data.replace(/\s/g, '')
  const buffer = Buffer.from(base64Payload, 'base64')

  await ensureDataDir()
  const extension = inferFileExtension(mimeType)
  const filename = buildLogoAssetFilename(logoId, extension)
  const relativePath = path.posix.join(LOGO_ASSETS_DIR, filename)
  const absolutePath = resolveDataPath(relativePath)

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, buffer)

  return {
    assetPath: relativePath,
    mimeType,
  }
}

function sanitizeIsoString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }
  return fallback
}

function coerceLogoEntry(value: unknown): LogoEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : null
  const contestIdRaw = typeof record.contestId === 'string' ? record.contestId.trim() : DEFAULT_CONTEST_ID
  const contestId = contestIdRaw.length > 0 ? contestIdRaw : DEFAULT_CONTEST_ID
  const nameField = typeof record.name === 'string' ? record.name.trim() : null
  const codenameField = typeof record.codename === 'string' ? record.codename.trim() : null
  const image = typeof record.image === 'string' && record.image.trim().length > 0 ? record.image : null

  if (!id || !nameField || !image) {
    return null
  }

  const description =
    typeof record.description === 'string' && record.description.trim().length > 0
      ? record.description
      : undefined

  const ownerAlias = normalizeOwnerAlias(record.ownerAlias)
  const source: LogoEntry['source'] = record.source === 'catalog' ? 'catalog' : 'user'
  const submittedBy =
    typeof record.submittedBy === 'string' && record.submittedBy.trim().length > 0
      ? record.submittedBy.trim()
      : source === 'catalog'
        ? 'ces3@system'
        : undefined
  const assetPath = normalizeAssetPath(record.assetPath)

  const createdAt = sanitizeIsoString(record.createdAt, BASE_CATALOG_TIMESTAMP)
  const updatedAt = sanitizeIsoString(record.updatedAt, createdAt)
  const rawRemovedAt =
    typeof record.removedAt === 'string' && record.removedAt.trim().length > 0
      ? record.removedAt.trim()
      : null
  const removedAt = rawRemovedAt && !Number.isNaN(Date.parse(rawRemovedAt)) ? rawRemovedAt : null
  const removedBy =
    typeof record.removedBy === 'string' && record.removedBy.trim().length > 0
      ? record.removedBy.trim()
      : null

  return {
    id,
    contestId,
    name: nameField,
    codename: codenameField && codenameField.length > 0 ? codenameField : generateCodename(nameField),
    description,
    image,
  assetPath,
    ownerAlias,
    source,
    submittedBy,
    createdAt,
    updatedAt,
    removedAt,
    removedBy,
  }
}

async function normalizeUserLogoEntries(logos: LogoEntry[]): Promise<{ logos: LogoEntry[]; changed: boolean }> {
  let changed = false
  const normalized: LogoEntry[] = []

  for (const logo of logos) {
    if (logo.source !== 'user') {
      normalized.push(logo)
      continue
    }

    let next = { ...logo }
    let mutated = false

    const sanitizedAssetPath = normalizeAssetPath(next.assetPath)
    if (sanitizedAssetPath !== (next.assetPath ?? null)) {
      next.assetPath = sanitizedAssetPath
      mutated = true
    }

    if (!next.assetPath && typeof next.image === 'string' && next.image.startsWith('data:')) {
      try {
        const { assetPath } = await persistLogoAssetFromDataUrl(next.id, next.image)
        const updatedAt = new Date().toISOString()
        next.assetPath = assetPath
        next.updatedAt = updatedAt
        next.image = buildLogoImageUrl(next.id, updatedAt)
        mutated = true
      } catch (error) {
        console.warn(`Failed to persist logo asset for ${next.id}`, error)
      }
    }

    if (next.assetPath) {
      const desiredImage = buildLogoImageUrl(next.id, next.updatedAt)
      if (next.image !== desiredImage) {
        next.image = desiredImage
        mutated = true
      }
    }

    if (mutated) {
      changed = true
    }

    normalized.push(next)
  }

  return { logos: normalized, changed }
}

async function readLogosFile(): Promise<LogosFileSchema> {
  await ensureDataDir()
  const filePath = resolveDataPath(LOGOS_FILE)

  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LogosFileSchema>
    const logos = Array.isArray(parsed.logos)
      ? parsed.logos.map(coerceLogoEntry).filter((entry): entry is LogoEntry => Boolean(entry))
      : []

    if (logos.length > 0) {
      const { logos: normalizedLogos, changed } = await normalizeUserLogoEntries(logos)
      const schema: LogosFileSchema = {
        version: typeof parsed.version === 'number' ? parsed.version : LOGO_SCHEMA_VERSION,
        logos: normalizedLogos,
        updatedAt: sanitizeIsoString(parsed.updatedAt, new Date().toISOString()),
      }

      if (changed) {
        await writeLogosFile(schema)
      }

      return schema
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') {
        console.warn('Failed to read logos file, regenerating seed.', error)
      }
    } else {
      console.warn('Failed to read logos file, regenerating seed.', error)
    }
  }

  const seeded: LogosFileSchema = {
    version: LOGO_SCHEMA_VERSION,
    logos: logoCatalog.map((logo) => createCatalogEntry(logo, DEFAULT_CONTEST_ID)),
    updatedAt: new Date().toISOString(),
  }

  await writeLogosFile(seeded)
  return seeded
}

async function writeLogosFile(schema: LogosFileSchema) {
  await ensureDataDir()
  const filePath = resolveDataPath(LOGOS_FILE)
  const payload: LogosFileSchema = {
    version: LOGO_SCHEMA_VERSION,
    logos: sortLogos(schema.logos),
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function sanitizeEloState(raw: unknown): EloState {
  return parseEloState(raw)
}

async function readVotesFile(): Promise<VotesFileSchema> {
  await ensureDataDir()
  const filePath = resolveDataPath(VOTES_FILE)

  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<VotesFileSchema & { state?: unknown }>

    if (parsed && typeof parsed === 'object' && parsed.version === VOTE_SCHEMA_VERSION && parsed.contests) {
      const contests: Record<string, VotesFileContestState> = {}
      for (const [contestId, contestState] of Object.entries(parsed.contests)) {
        if (!contestState || typeof contestState !== 'object') continue
        const state = sanitizeEloState((contestState as VotesFileContestState).state)
        const updatedAt = sanitizeIsoString(
          (contestState as VotesFileContestState).updatedAt,
          new Date().toISOString(),
        )
        contests[contestId] = { state, updatedAt }
      }

      return {
        version: VOTE_SCHEMA_VERSION,
        contests,
        updatedAt: sanitizeIsoString(parsed.updatedAt, new Date().toISOString()),
      }
    }

    const legacyState = sanitizeEloState(parsed.state ?? parsed)
    const converted: VotesFileSchema = {
      version: VOTE_SCHEMA_VERSION,
      contests: {
        [DEFAULT_CONTEST_ID]: {
          state: legacyState,
          updatedAt: sanitizeIsoString(parsed.updatedAt, new Date().toISOString()),
        },
      },
      updatedAt: sanitizeIsoString(parsed.updatedAt, new Date().toISOString()),
    }

    await writeVotesFile(converted)
    return converted
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') {
        console.warn('Failed to read votes file, creating new state.', error)
      }
    } else {
      console.warn('Failed to read votes file, creating new state.', error)
    }
  }

  const logosFile = await readLogosFile()
  const defaultLogos = logosFile.logos.filter(
    (logo) => logo.contestId === DEFAULT_CONTEST_ID && !logo.removedAt,
  )
  const initialState = ensureEntries({ entries: {}, history: [] }, defaultLogos)
  const seeded: VotesFileSchema = {
    version: VOTE_SCHEMA_VERSION,
    contests: {
      [DEFAULT_CONTEST_ID]: {
        state: initialState,
        updatedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  }
  await writeVotesFile(seeded)
  return seeded
}

async function writeVotesFile(schema: VotesFileSchema) {
  await ensureDataDir()
  const filePath = resolveDataPath(VOTES_FILE)
  const payload: VotesFileSchema = {
    version: VOTE_SCHEMA_VERSION,
    contests: schema.contests,
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function ensureContestVotes(
  schema: VotesFileSchema,
  contestId: string,
  logos: LogoEntry[],
): { schema: VotesFileSchema; state: EloState; changed: boolean } {
  const existing = schema.contests[contestId]
  const currentState = existing ? existing.state : { entries: {}, history: [] }

  const ensured = ensureEntries(currentState, logos)
  const pruned = pruneEntries(ensured, logos)

  const changed = !existing || ensured !== currentState || pruned !== ensured

  if (!changed) {
    return {
      schema,
      state: pruned,
      changed: false,
    }
  }

  const updatedState: EloState = pruned
  const contests = {
    ...schema.contests,
    [contestId]: {
      state: updatedState,
      updatedAt: new Date().toISOString(),
    },
  }

  return {
    schema: {
      version: VOTE_SCHEMA_VERSION,
      contests,
      updatedAt: new Date().toISOString(),
    },
    state: updatedState,
    changed: true,
  }
}

async function resolveContestId(contestId?: string | null): Promise<string> {
  const raw = (contestId ?? '').toString().trim()
  if (!raw) {
    return getActiveContestId()
  }
  const contest = await ensureContest(raw)
  return contest.id
}

function sanitizeSubmitInput(input: SubmitLogoInput): SanitizedSubmitInput {
  const name = input.name.trim()
  const description = input.description?.trim()
  const image = input.image.trim()
  const submittedBy = input.submittedBy.trim()
  const ownerAlias = normalizeOwnerAlias(input.ownerAlias)

  if (!name) {
    throw new Error('Name is required')
  }
  if (!image) {
    throw new Error('Image is required')
  }
  if (!DATA_URL_REGEX.test(image)) {
    throw new Error('Image must be provided as a base64 data URL')
  }
  if (!submittedBy) {
    throw new Error('Submitter identity is required')
  }

  return {
    name,
    description: description && description.length > 0 ? description : undefined,
    image,
    submittedBy,
    ownerAlias,
  }
}

async function getContestLogosInternal(
  contestId: string,
  options: { includeRemoved?: boolean; logosFile?: LogosFileSchema } = {},
): Promise<{ logos: LogoEntry[]; logosFile: LogosFileSchema }> {
  const logosFile = options.logosFile ?? (await readLogosFile())
  const includeRemoved = options.includeRemoved ?? false
  const filtered = logosFile.logos.filter(
    (logo) => logo.contestId === contestId && (includeRemoved || !logo.removedAt),
  )
  return {
    logos: sortLogos(filtered),
    logosFile,
  }
}

export async function getAllLogos(contestId?: string): Promise<LogoEntry[]> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId)
  return logos
}

export async function getAllLogosIncludingRemoved(contestId?: string): Promise<LogoEntry[]> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId, { includeRemoved: true })
  return logos
}

export async function findLogoById(id: string): Promise<LogoEntry | null> {
  const logosFile = await readLogosFile()
  const logo = logosFile.logos.find((entry) => entry.id === id)
  return logo ?? null
}

export async function addLogo(input: SubmitLogoInput): Promise<LogoEntry> {
  const [resolvedContestId, sanitized] = await Promise.all([
    resolveContestId(input.contestId),
    Promise.resolve(sanitizeSubmitInput(input)),
  ])

  const logosFile = await readLogosFile()

  const logoId = randomUUID()
  const { assetPath } = await persistLogoAssetFromDataUrl(logoId, sanitized.image)
  const timestamp = new Date().toISOString()
  const entry: LogoEntry = {
    id: logoId,
    contestId: resolvedContestId,
    name: sanitized.name,
    codename: generateCodename(sanitized.name),
    description: sanitized.description,
    image: buildLogoImageUrl(logoId, timestamp),
    assetPath,
    ownerAlias: sanitized.ownerAlias,
    source: 'user',
    submittedBy: sanitized.submittedBy,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
    removedBy: null,
  }

  const nextLogos = sortLogos([
    ...logosFile.logos.filter((logo) => logo.id !== entry.id),
    entry,
  ])

  await writeLogosFile({
    version: LOGO_SCHEMA_VERSION,
    logos: nextLogos,
    updatedAt: timestamp,
  })

  const activeLogos = nextLogos.filter(
    (logo) => logo.contestId === resolvedContestId && !logo.removedAt,
  )
  const votesFile = await readVotesFile()
  const { schema: ensuredVotes, changed } = ensureContestVotes(
    votesFile,
    resolvedContestId,
    activeLogos,
  )
  if (changed) {
    await writeVotesFile(ensuredVotes)
  }

  return entry
}

export async function updateLogoOwner(
  id: string,
  ownerAlias: string | null,
  contestId?: string,
): Promise<LogoEntry | null> {
  const normalized = normalizeOwnerAlias(ownerAlias)
  const logosFile = await readLogosFile()
  const resolvedContestId = contestId ? await resolveContestId(contestId) : null

  const index = logosFile.logos.findIndex(
    (logo) => logo.id === id && (!resolvedContestId || logo.contestId === resolvedContestId),
  )
  if (index === -1) {
    return null
  }

  const target = logosFile.logos[index]!
  const updatedContestId = resolvedContestId ?? target.contestId

  const updated: LogoEntry = {
    ...target,
    ownerAlias: normalized,
    updatedAt: new Date().toISOString(),
  }

  if (updated.assetPath) {
    updated.image = buildLogoImageUrl(updated.id, updated.updatedAt)
  }

  const nextLogos = sortLogos([
    ...logosFile.logos.slice(0, index),
    updated,
    ...logosFile.logos.slice(index + 1),
  ])

  await writeLogosFile({
    version: LOGO_SCHEMA_VERSION,
    logos: nextLogos,
    updatedAt: new Date().toISOString(),
  })

  const activeLogos = nextLogos.filter(
    (logo) => logo.contestId === updatedContestId && !logo.removedAt,
  )
  const votesFile = await readVotesFile()
  const { schema: ensuredVotes, changed } = ensureContestVotes(
    votesFile,
    updatedContestId,
    activeLogos,
  )
  if (changed) {
    await writeVotesFile(ensuredVotes)
  }

  return updated
}

export async function removeLogo(
  id: string,
  removedBy: string | null,
  contestId?: string,
): Promise<LogoEntry | null> {
  const logosFile = await readLogosFile()
  const resolvedContestId = contestId ? await resolveContestId(contestId) : null

  const index = logosFile.logos.findIndex(
    (logo) => logo.id === id && (!resolvedContestId || logo.contestId === resolvedContestId),
  )
  if (index === -1) {
    return null
  }

  const timestamp = new Date().toISOString()
  const target = logosFile.logos[index]!
  const updatedContestId = resolvedContestId ?? target.contestId

  const updated: LogoEntry = {
    ...target,
    removedAt: timestamp,
    removedBy: removedBy && removedBy.trim().length > 0 ? removedBy.trim() : null,
    updatedAt: timestamp,
  }

  if (updated.assetPath) {
    updated.image = buildLogoImageUrl(updated.id, updated.updatedAt)
  }

  const nextLogos = sortLogos([
    ...logosFile.logos.slice(0, index),
    updated,
    ...logosFile.logos.slice(index + 1),
  ])

  await writeLogosFile({
    version: LOGO_SCHEMA_VERSION,
    logos: nextLogos,
    updatedAt: timestamp,
  })

  const activeLogos = nextLogos.filter(
    (logo) => logo.contestId === updatedContestId && !logo.removedAt,
  )
  const votesFile = await readVotesFile()
  const { schema: ensuredVotes, changed, state } = ensureContestVotes(
    votesFile,
    updatedContestId,
    activeLogos,
  )

  if (changed) {
    await writeVotesFile(ensuredVotes)
  } else if (state !== votesFile.contests[updatedContestId]?.state) {
    await writeVotesFile(ensuredVotes)
  }

  return updated
}

export async function getEloState(contestId?: string): Promise<EloState> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId)
  const votesFile = await readVotesFile()

  const { schema: ensuredVotes, state, changed } = ensureContestVotes(
    votesFile,
    resolvedContestId,
    logos,
  )

  if (changed) {
    await writeVotesFile(ensuredVotes)
  }

  return state
}

export async function recordVote(
  winnerId: string,
  loserId: string,
  voterHash: string | null,
  contestId?: string,
): Promise<EloState> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId)
  const votesFile = await readVotesFile()

  const { state: ensuredState } = ensureContestVotes(votesFile, resolvedContestId, logos)

  const nextState = applyMatch(ensuredState, winnerId, loserId, voterHash)

  const nextSchema: VotesFileSchema = {
    version: VOTE_SCHEMA_VERSION,
    contests: {
      ...votesFile.contests,
      [resolvedContestId]: {
        state: nextState,
        updatedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  }

  await writeVotesFile(nextSchema)
  return nextState
}

export async function resetContestVotes(contestId?: string): Promise<EloState> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId)
  const blankState = pruneEntries(ensureEntries({ entries: {}, history: [] }, logos), logos)

  const votesFile = await readVotesFile()

  const nextSchema: VotesFileSchema = {
    version: VOTE_SCHEMA_VERSION,
    contests: {
      ...votesFile.contests,
      [resolvedContestId]: {
        state: blankState,
        updatedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  }

  await writeVotesFile(nextSchema)
  return blankState
}

export async function getContestMetrics(
  contestId: string,
): Promise<{
  logoCount: number
  matchCount: number
  leaderboard: Array<{
    logoId: string
    logoName: string
    logoCodename: string
    logoImage: string
    rating: number
    wins: number
    losses: number
    matches: number
  }>
  lastMatchAt: string | null
}> {
  const resolvedContestId = await resolveContestId(contestId)
  const { logos } = await getContestLogosInternal(resolvedContestId)
  const votesFile = await readVotesFile()
  const { schema: ensuredVotes, state, changed } = ensureContestVotes(
    votesFile,
    resolvedContestId,
    logos,
  )

  if (changed) {
    await writeVotesFile(ensuredVotes)
  }

  const logoIndex = new Map(logos.map((logo) => [logo.id, logo]))

  const leaderboard = Object.entries(state.entries)
    .map(([logoId, entry]) => {
      const logo = logoIndex.get(logoId)
      if (!logo) {
        return null
      }
      return {
        logoId,
        logoName: logo.name,
        logoCodename: logo.codename,
        logoImage: logo.image,
        rating: entry.rating,
        wins: entry.wins,
        losses: entry.losses,
        matches: entry.matches,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)

  const lastMatchAt = state.history.length > 0
    ? new Date(state.history[state.history.length - 1]!.timestamp).toISOString()
    : null

  return {
    logoCount: logos.length,
    matchCount: state.history.length,
    leaderboard,
    lastMatchAt,
  }
}
