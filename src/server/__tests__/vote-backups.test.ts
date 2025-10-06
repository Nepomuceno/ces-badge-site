import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ISO_NOW = '2024-01-01T00:00:00.000Z'

let recordVote: typeof import('../data-store').recordVote
let getEloState: typeof import('../data-store').getEloState
let resetContestVotes: typeof import('../data-store').resetContestVotes

async function seedContestFiles(dataDir: string) {
  await writeFile(
    path.join(dataDir, 'contests.json'),
    `${JSON.stringify(
      {
        version: 1,
        activeContestId: 'test-contest',
        contests: [
          {
            id: 'test-contest',
            slug: 'test-contest',
            title: 'Test Contest',
            subtitle: null,
            description: null,
            status: 'active',
            createdAt: ISO_NOW,
            updatedAt: ISO_NOW,
            startsAt: ISO_NOW,
            endsAt: ISO_NOW,
            archivedAt: null,
            votingOpen: true,
          },
        ],
        updatedAt: ISO_NOW,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )

  await writeFile(
    path.join(dataDir, 'logos.json'),
    `${JSON.stringify(
      {
        version: 3,
        logos: [
          {
            id: 'logo-1',
            contestId: 'test-contest',
            name: 'Alpha',
            codename: 'alpha',
            description: 'Leading mark',
            image: '/alpha.png',
            ownerAlias: 'alpha-owner',
            source: 'user',
            submittedBy: 'tester@ces3',
            createdAt: ISO_NOW,
            updatedAt: ISO_NOW,
            removedAt: null,
            removedBy: null,
          },
          {
            id: 'logo-2',
            contestId: 'test-contest',
            name: 'Bravo',
            codename: 'bravo',
            description: 'Runner up',
            image: '/bravo.png',
            ownerAlias: 'bravo-owner',
            source: 'user',
            submittedBy: 'tester@ces3',
            createdAt: ISO_NOW,
            updatedAt: ISO_NOW,
            removedAt: null,
            removedBy: null,
          },
        ],
        updatedAt: ISO_NOW,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )

  await writeFile(
    path.join(dataDir, 'votes.json'),
    `${JSON.stringify(
      {
        version: 2,
        contests: {
          'test-contest': {
            state: {
              entries: {
                'logo-1': { rating: 1500, wins: 0, losses: 0, matches: 0 },
                'logo-2': { rating: 1500, wins: 0, losses: 0, matches: 0 },
              },
              history: [],
            },
            updatedAt: ISO_NOW,
          },
        },
        updatedAt: ISO_NOW,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )
}

describe('vote persistence backups', () => {
  let dataDir: string
  let originalDataDir: string | undefined

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'ces3-backup-'))
    originalDataDir = process.env.DATA_DIR
    process.env.DATA_DIR = dataDir

    vi.useFakeTimers()
    vi.setSystemTime(new Date(ISO_NOW))
    vi.resetModules()

    await seedContestFiles(dataDir)

  ;({ recordVote, getEloState, resetContestVotes } = await import('../data-store'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.resetModules()
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR
    } else {
      process.env.DATA_DIR = originalDataDir
    }
    await rm(dataDir, { recursive: true, force: true })
  })

  it('creates a backup snapshot whenever votes are written', async () => {
    await recordVote('logo-1', 'logo-2', 'hash-v1', 'test-contest')

    const backupDir = path.join(dataDir, 'backups', 'votes')
    const backups = await readdir(backupDir)
    expect(backups.length).toBeGreaterThan(0)
  })

  it('throttles backups when votes happen in quick succession', async () => {
    await recordVote('logo-1', 'logo-2', 'hash-v1', 'test-contest')
    const backupDir = path.join(dataDir, 'backups', 'votes')
    const first = await readdir(backupDir)

    await recordVote('logo-1', 'logo-2', 'hash-v2', 'test-contest')
    const second = await readdir(backupDir)
    expect(second.length).toBe(first.length)

    vi.advanceTimersByTime(16_000)

    await recordVote('logo-1', 'logo-2', 'hash-v3', 'test-contest')
    const third = await readdir(backupDir)
    expect(third.length).toBeGreaterThan(first.length)
  })

  it('captures a fresh backup when votes are reset', async () => {
    await recordVote('logo-1', 'logo-2', 'hash-v1', 'test-contest')

    const backupDir = path.join(dataDir, 'backups', 'votes')
    const before = await readdir(backupDir)

    await resetContestVotes('test-contest')

    const after = await readdir(backupDir)
    expect(after.length).toBeGreaterThan(before.length)
  })

  it('restores the latest backup if the votes file is corrupted', async () => {
    await recordVote('logo-1', 'logo-2', 'hash-v1', 'test-contest')

    const votesPath = path.join(dataDir, 'votes.json')
    const beforeCorruption = await readFile(votesPath, 'utf-8')

    await writeFile(votesPath, '{"broken": true', 'utf-8')

    const state = await getEloState('test-contest')
    expect(state.history).toHaveLength(1)

    const restored = await readFile(votesPath, 'utf-8')
    expect(restored).toEqual(beforeCorruption)
  })
})
