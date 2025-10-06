#!/usr/bin/env bun

import { stat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

import {
  DEFAULT_CONTEST_ID,
} from '../src/lib/contest-utils'
import {
  HISTORY_LIMIT,
  K_FACTOR,
  DEFAULT_RATING,
  normalizeVoterHash,
  type EloEntry,
  type EloState,
  type MatchHistoryEntry,
} from '../src/lib/elo-engine'
import type { LogoEntry } from '../src/lib/logo-utils'

interface VotesFileContestState {
  state: EloState
  updatedAt: string
}

interface VotesFileSchema {
  version: number
  contests: Record<string, VotesFileContestState>
  updatedAt: string
}

interface LogosFileSchema {
  version: number
  logos: LogoEntry[]
  updatedAt: string
}

interface CliOptions {
  inputDir: string
  outputPath: string
  logosPath: string
  contestFilter: Set<string> | null
  dryRun: boolean
  verbose: boolean
  maxHistory: number | null
}

interface ContestAggregation {
  matches: MatchHistoryEntry[]
  latestUpdatedAt: string
  uniqueMatchCount: number
  duplicateCount: number
  inferredEntryMatches: number
}

interface MergeSummary {
  contestId: string
  matchesApplied: number
  duplicatesSkipped: number
  warnings: string[]
  earliestTimestamp?: number
  latestTimestamp?: number
  missingHistoryEstimate?: number
}

function printHelp(): void {
  console.log(`Usage: bun scripts/merge-votes.ts --input <directory> [options]

Options:
  --input <directory>        Directory containing vote JSON files to merge (required)
  --output <path>            Path for the merged votes.json (default: server/runtime-data/votes.json)
  --logos <path>             Path to logos.json for contest roster (default: server/runtime-data/logos.json)
  --contest <id>             Only merge specific contest (can be repeated)
  --max-history <count>      Override history retention (default: ${HISTORY_LIMIT}, 0 or negative to keep all)
  --dry-run                  Compute results without writing output file
  --verbose                  Print detailed processing logs
  --help                     Show this message
`)
}

function sanitizeIsoString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }
  return fallback
}

function sanitizeTimestamp(value: unknown, fallback: number, warnings: string[], context: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  warnings.push(`Match at ${context} has invalid timestamp, using fallback ${new Date(fallback).toISOString()}`)
  return fallback
}

function parseArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    inputDir: '',
    outputPath: path.resolve('server/runtime-data/votes.json'),
    logosPath: path.resolve('server/runtime-data/logos.json'),
    contestFilter: null,
    dryRun: false,
    verbose: false,
    maxHistory: null,
  }

  const contests = new Set<string>()

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--input':
        defaults.inputDir = path.resolve(argv[++i] ?? '')
        break
      case '--output':
        defaults.outputPath = path.resolve(argv[++i] ?? defaults.outputPath)
        break
      case '--logos':
        defaults.logosPath = path.resolve(argv[++i] ?? defaults.logosPath)
        break
      case '--contest':
        contests.add(argv[++i] ?? '')
        break
      case '--max-history': {
        const raw = argv[++i]
        if (!raw) {
          throw new Error('--max-history requires a number argument')
        }
        const parsed = Number(raw)
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid --max-history value: ${raw}`)
        }
        defaults.maxHistory = parsed
        break
      }
      case '--dry-run':
        defaults.dryRun = true
        break
      case '--verbose':
        defaults.verbose = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        if (arg.startsWith('--input=')) {
          defaults.inputDir = path.resolve(arg.split('=')[1] ?? '')
        } else if (arg.startsWith('--output=')) {
          defaults.outputPath = path.resolve(arg.split('=')[1] ?? defaults.outputPath)
        } else if (arg.startsWith('--logos=')) {
          defaults.logosPath = path.resolve(arg.split('=')[1] ?? defaults.logosPath)
        } else if (arg.startsWith('--contest=')) {
          contests.add(arg.split('=')[1] ?? '')
        } else if (arg.startsWith('--max-history=')) {
          const raw = arg.split('=')[1]
          if (!raw) throw new Error('--max-history requires a number')
          const parsed = Number(raw)
          if (Number.isNaN(parsed)) {
            throw new Error(`Invalid --max-history value: ${raw}`)
          }
          defaults.maxHistory = parsed
        } else if (arg === '--dryrun') {
          defaults.dryRun = true
        } else {
          console.warn(`Ignoring unknown argument: ${arg}`)
        }
    }
  }

  if (!defaults.inputDir) {
    throw new Error('Missing required --input <directory> argument.')
  }

  if (contests.size > 0) {
    defaults.contestFilter = new Set(Array.from(contests).filter((id) => id.trim().length > 0))
  }

  return defaults
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

function applyMatch(
  state: EloState,
  match: MatchHistoryEntry,
  maxHistory: number,
): EloState {
  const winner = state.entries[match.winnerId] ?? createEmptyEntry()
  const loser = state.entries[match.loserId] ?? createEmptyEntry()

  const expectedWinner = expectedScore(winner.rating, loser.rating)
  const expectedLoser = expectedScore(loser.rating, winner.rating)

  const updatedWinner: EloEntry = {
    rating: winner.rating + K_FACTOR * (1 - expectedWinner),
    wins: winner.wins + 1,
    losses: winner.losses,
    matches: winner.matches + 1,
  }

  const updatedLoser: EloEntry = {
    rating: loser.rating + K_FACTOR * (0 - expectedLoser),
    wins: loser.wins,
    losses: loser.losses + 1,
    matches: loser.matches + 1,
  }

  const entries: Record<string, EloEntry> = {
    ...state.entries,
    [match.winnerId]: updatedWinner,
    [match.loserId]: updatedLoser,
  }

  const normalizedHash = normalizeVoterHash(match.voterHash)
  const historyEntry: MatchHistoryEntry = {
    winnerId: match.winnerId,
    loserId: match.loserId,
    timestamp: match.timestamp,
    voterHash: normalizedHash,
  }

  const history = [historyEntry, ...state.history]
  const trimmedHistory = maxHistory > 0 ? history.slice(0, maxHistory) : history

  return {
    entries,
    history: trimmedHistory,
  }
}

function createEmptyEntry(): EloEntry {
  return {
    rating: DEFAULT_RATING,
    wins: 0,
    losses: 0,
    matches: 0,
  }
}

function sanitizeLogoEntry(entry: LogoEntry): LogoEntry {
  return {
    ...entry,
    id: entry.id,
    contestId: entry.contestId,
  }
}

function collectContestLogos(logos: LogoEntry[]): Map<string, LogoEntry[]> {
  const map = new Map<string, LogoEntry[]>()
  for (const logo of logos) {
    if (logo.removedAt) continue
    const existing = map.get(logo.contestId) ?? []
    existing.push(sanitizeLogoEntry(logo))
    map.set(logo.contestId, existing)
  }
  return map
}

function parseVotesFile(data: unknown, source: string): VotesFileSchema {
  if (!data || typeof data !== 'object') {
    throw new Error(`Votes file ${source} is not a JSON object.`)
  }

  const record = data as Record<string, unknown>
  const fallbackDate = new Date().toISOString()

  if (typeof record.version === 'number' && record.contests && typeof record.contests === 'object') {
    const contestsRaw = record.contests as Record<string, unknown>
    const contests: Record<string, VotesFileContestState> = {}

    for (const [contestId, value] of Object.entries(contestsRaw)) {
      if (!value || typeof value !== 'object') continue
      const contestRecord = value as Record<string, unknown>
      const state = contestRecord.state
      const parsedState = parseEloState(state)
      contests[contestId] = {
        state: parsedState,
        updatedAt: sanitizeIsoString(contestRecord.updatedAt, fallbackDate),
      }
    }

    return {
      version: 2,
      contests,
      updatedAt: sanitizeIsoString(record.updatedAt, fallbackDate),
    }
  }

  // Legacy schema { state, updatedAt }
  const parsedState = parseEloState(record.state ?? record)
  const contestId = DEFAULT_CONTEST_ID
  return {
    version: 2,
    contests: {
      [contestId]: {
        state: parsedState,
        updatedAt: sanitizeIsoString(record.updatedAt, fallbackDate),
      },
    },
    updatedAt: sanitizeIsoString(record.updatedAt, fallbackDate),
  }
}

function parseEloState(value: unknown): EloState {
  if (!value || typeof value !== 'object') {
    return {
      entries: {},
      history: [],
    }
  }

  const record = value as Partial<EloState>
  const entries: Record<string, EloEntry> = {}
  if (record.entries && typeof record.entries === 'object') {
    for (const [logoId, rawEntry] of Object.entries(record.entries)) {
      const coerced = coerceEntry(rawEntry)
      if (coerced) {
        entries[logoId] = coerced
      }
    }
  }

  return {
    entries,
    history: Array.isArray(record.history) ? sanitizeHistory(record.history) : [],
  }
}

function coerceEntry(value: unknown): EloEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const entry = value as Record<string, unknown>
  const rating = Number(entry.rating)
  const wins = Number(entry.wins)
  const losses = Number(entry.losses)
  const matches = Number(entry.matches)
  if ([rating, wins, losses, matches].some((n) => Number.isNaN(n))) {
    return null
  }
  return { rating, wins, losses, matches }
}

function sanitizeHistory(entries: unknown[]): MatchHistoryEntry[] {
  const history: MatchHistoryEntry[] = []
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const winnerId = typeof record.winnerId === 'string' ? record.winnerId : null
    const loserId = typeof record.loserId === 'string' ? record.loserId : null
    const timestampRaw = record.timestamp
    const voterHash = typeof record.voterHash === 'string' ? record.voterHash : null
    if (!winnerId || !loserId) continue
    const timestamp = typeof timestampRaw === 'number' && Number.isFinite(timestampRaw)
      ? timestampRaw
      : typeof timestampRaw === 'string'
        ? Date.parse(timestampRaw)
        : Number.NaN
    if (Number.isNaN(timestamp)) continue
    history.push({ winnerId, loserId, timestamp, voterHash: normalizeVoterHash(voterHash) })
  }
  return history
}

async function loadVotesFiles(options: CliOptions, warnings: string[]): Promise<Map<string, ContestAggregation>> {
  const files = await readVoteFilesFromDirectory(options.inputDir)
  if (files.length === 0) {
    throw new Error(`No vote JSON files found in ${options.inputDir}`)
  }

  const contests = new Map<string, ContestAggregation>()

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      const votes = parseVotesFile(parsed, filePath)

      for (const [contestId, contestState] of Object.entries(votes.contests)) {
        if (options.contestFilter && !options.contestFilter.has(contestId)) {
          continue
        }

        const bucket = contests.get(contestId) ?? {
          matches: [],
          latestUpdatedAt: contestState.updatedAt,
          uniqueMatchCount: 0,
          duplicateCount: 0,
          inferredEntryMatches: 0,
        }

        if (contestState.updatedAt > bucket.latestUpdatedAt) {
          bucket.latestUpdatedAt = contestState.updatedAt
        }

        let inferredMatches = bucket.inferredEntryMatches
        for (const entry of Object.values(contestState.state.entries)) {
          if (entry.matches > inferredMatches) {
            inferredMatches = entry.matches
          }
        }
        bucket.inferredEntryMatches = inferredMatches

        const seen = new Set<string>(bucket.matches.map(createMatchKey))
        for (const match of contestState.state.history) {
          const sanitized: MatchHistoryEntry = {
            winnerId: match.winnerId,
            loserId: match.loserId,
            timestamp: match.timestamp,
            voterHash: match.voterHash,
          }
          const key = createMatchKey(sanitized)
          if (seen.has(key)) {
            bucket.duplicateCount += 1
            continue
          }
          seen.add(key)
          bucket.matches.push(sanitized)
        }

        bucket.uniqueMatchCount = bucket.matches.length
        contests.set(contestId, bucket)
      }
    } catch (error) {
      warnings.push(`Failed to process ${filePath}: ${(error as Error).message}`)
    }
  }

  return contests
}

async function readVoteFilesFromDirectory(dir: string): Promise<string[]> {
  const stats = await stat(dir)
  if (!stats.isDirectory()) {
    throw new Error(`${dir} is not a directory`)
  }

  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.json')) continue
    files.push(path.join(dir, entry.name))
  }
  files.sort()
  return files
}

function createMatchKey(match: MatchHistoryEntry): string {
  return `${match.timestamp}|${match.winnerId}|${match.loserId}|${match.voterHash ?? ''}`
}

function ensureEntriesForLogos(entries: Record<string, EloEntry>, logos: LogoEntry[]): Record<string, EloEntry> {
  const next = { ...entries }
  for (const logo of logos) {
    if (!next[logo.id]) {
      next[logo.id] = createEmptyEntry()
    }
  }
  return next
}

function mergeContest(
  contestId: string,
  aggregation: ContestAggregation,
  logos: LogoEntry[],
  maxHistory: number,
): MergeSummary & { state: EloState } {
  const warnings: string[] = []
  if (aggregation.matches.length === 0) {
    return {
      contestId,
      state: {
        entries: ensureEntriesForLogos({}, logos),
        history: [],
      },
      matchesApplied: 0,
      duplicatesSkipped: aggregation.duplicateCount,
      warnings: [`No matches found for contest ${contestId}.`],
    }
  }

  const sortedMatches = [...aggregation.matches].sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      const winnerCompare = a.winnerId.localeCompare(b.winnerId)
      if (winnerCompare !== 0) return winnerCompare
      const loserCompare = a.loserId.localeCompare(b.loserId)
      if (loserCompare !== 0) return loserCompare
      return (a.voterHash ?? '').localeCompare(b.voterHash ?? '')
    }
    return a.timestamp - b.timestamp
  })

  const seenKeys = new Set<string>()
  const uniqueMatches: MatchHistoryEntry[] = []
  let duplicates = aggregation.duplicateCount

  for (const match of sortedMatches) {
    const context = `${contestId} @ ${new Date(match.timestamp).toISOString()}`
    const sanitizedTimestamp = sanitizeTimestamp(match.timestamp, Date.now(), warnings, context)
    const sanitizedMatch: MatchHistoryEntry = {
      winnerId: match.winnerId,
      loserId: match.loserId,
      timestamp: sanitizedTimestamp,
      voterHash: normalizeVoterHash(match.voterHash ?? null),
    }
    const key = createMatchKey(sanitizedMatch)
    if (seenKeys.has(key)) {
      duplicates += 1
      continue
    }
    seenKeys.add(key)
    uniqueMatches.push(sanitizedMatch)
  }

  let state: EloState = {
    entries: ensureEntriesForLogos({}, logos),
    history: [],
  }

  let earliest = uniqueMatches[0]?.timestamp
  let latest = uniqueMatches[uniqueMatches.length - 1]?.timestamp

  for (const match of uniqueMatches) {
    // Ensure entries exist for logos not in roster
    if (!state.entries[match.winnerId]) {
      state.entries[match.winnerId] = createEmptyEntry()
    }
    if (!state.entries[match.loserId]) {
      state.entries[match.loserId] = createEmptyEntry()
    }
    state = applyMatch(state, match, maxHistory)
    const currentEarliest = earliest ?? match.timestamp
    if (match.timestamp < currentEarliest) {
      earliest = match.timestamp
    }
    const currentLatest = latest ?? match.timestamp
    if (match.timestamp > currentLatest) {
      latest = match.timestamp
    }
  }

  state.entries = ensureEntriesForLogos(state.entries, logos)

  const missingHistory = aggregation.inferredEntryMatches > uniqueMatches.length
    ? aggregation.inferredEntryMatches - uniqueMatches.length
    : undefined

  if (missingHistory && missingHistory > 0) {
    warnings.push(
      `Contest ${contestId} may have lost ${missingHistory} matches because history files were truncated. Final Elo recomputed from available ${uniqueMatches.length} matches.`,
    )
  }

  return {
    contestId,
    state,
    matchesApplied: uniqueMatches.length,
    duplicatesSkipped: duplicates,
    warnings,
    earliestTimestamp: earliest,
    latestTimestamp: latest,
    missingHistoryEstimate: missingHistory,
  }
}

async function loadLogos(options: CliOptions): Promise<LogoEntry[]> {
  try {
    const raw = await readFile(options.logosPath, 'utf8')
    const data = JSON.parse(raw) as LogosFileSchema
    if (!data || typeof data !== 'object' || !Array.isArray(data.logos)) {
      throw new Error('Invalid logos file shape')
    }
    return data.logos
  } catch (error) {
    console.warn(
      `Failed to load logos from ${options.logosPath}: ${(error as Error).message}. Continuing without roster alignment.`,
    )
    return []
  }
}

async function writeMergedVotes(
  outputPath: string,
  merged: VotesFileSchema,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log('[dry-run] Skipping write of merged votes file')
    return
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  console.log(`Merged votes written to ${outputPath}`)
}

export async function main() {
  const options = parseArgs(process.argv.slice(2))
  const globalWarnings: string[] = []

  if (options.verbose) {
    console.log('Loading vote files from', options.inputDir)
  }

  const aggregations = await loadVotesFiles(options, globalWarnings)

  if (aggregations.size === 0) {
    throw new Error('No contests found in provided vote files.')
  }

  const logos = await loadLogos(options)
  const contestLogos = collectContestLogos(logos)

  const maxHistory = options.maxHistory ?? HISTORY_LIMIT
  const mergedContests: Record<string, VotesFileContestState> = {}
  const summaries: MergeSummary[] = []

  for (const [contestId, aggregation] of aggregations) {
    const logosForContest = contestLogos.get(contestId) ?? []
  const summary = mergeContest(contestId, aggregation, logosForContest, maxHistory)
    mergedContests[contestId] = {
      state: summary.state,
      updatedAt: aggregation.latestUpdatedAt,
    }
    summaries.push(summary)
  }

  const mergedVotes: VotesFileSchema = {
    version: 2,
    contests: mergedContests,
    updatedAt: new Date().toISOString(),
  }

  for (const summary of summaries) {
    console.log(`Contest ${summary.contestId}: applied ${summary.matchesApplied} matches; skipped ${summary.duplicatesSkipped} duplicates.`)
    if (summary.earliestTimestamp && summary.latestTimestamp) {
      console.log(
        `  Time range: ${new Date(summary.earliestTimestamp).toISOString()} - ${new Date(summary.latestTimestamp).toISOString()}`,
      )
    }
    if (summary.missingHistoryEstimate) {
      console.log(`  Warning: Potentially missing ${summary.missingHistoryEstimate} historical matches.`)
    }
    for (const warning of summary.warnings) {
      console.warn(`  Warning: ${warning}`)
    }
  }

  for (const warning of globalWarnings) {
    console.warn(`Warning: ${warning}`)
  }

  await writeMergedVotes(options.outputPath, mergedVotes, options.dryRun)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export {
  parseVotesFile,
  mergeContest,
  ensureEntriesForLogos,
}

export type { ContestAggregation }
