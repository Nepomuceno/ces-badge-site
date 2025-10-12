import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ISO_NOW = '2024-01-01T00:00:00.000Z'
const MATCH_ONE_TIMESTAMP = 1_700_000_000_000
const MATCH_TWO_TIMESTAMP = 1_700_000_100_000

let recalculateContestElo: typeof import('../data-store').recalculateContestElo

describe('recalculateContestElo', () => {
  let dataDir: string
  let originalDataDir: string | undefined

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'ces3-recalc-'))
    originalDataDir = process.env.DATA_DIR
    process.env.DATA_DIR = dataDir

    vi.resetModules()

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
              endsAt: null,
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
              ownerAlias: null,
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
              ownerAlias: null,
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

    await writeFile(
      path.join(dataDir, 'vote-events.ndjson'),
      [
        JSON.stringify({
          id: 'evt-1',
          type: 'vote-recorded',
          occurredAt: ISO_NOW,
          contestId: 'test-contest',
          voterHash: null,
          matchTimestamp: MATCH_ONE_TIMESTAMP,
          matchHistoryLength: 1,
          winner: {
            id: 'logo-1',
            name: 'Alpha',
            codename: 'alpha',
            ratingBefore: 1500,
            ratingAfter: 1516,
            winsBefore: 0,
            winsAfter: 1,
            lossesBefore: 0,
            lossesAfter: 0,
            matchesBefore: 0,
            matchesAfter: 1,
          },
          loser: {
            id: 'logo-2',
            name: 'Bravo',
            codename: 'bravo',
            ratingBefore: 1500,
            ratingAfter: 1484,
            winsBefore: 0,
            winsAfter: 0,
            lossesBefore: 0,
            lossesAfter: 1,
            matchesBefore: 0,
            matchesAfter: 1,
          },
        }),
        JSON.stringify({
          id: 'evt-2',
          type: 'vote-recorded',
          occurredAt: '2024-01-01T00:05:00.000Z',
          contestId: 'test-contest',
          voterHash: null,
          matchTimestamp: MATCH_TWO_TIMESTAMP,
          matchHistoryLength: 2,
          winner: {
            id: 'logo-1',
            name: 'Alpha',
            codename: 'alpha',
            ratingBefore: 1516,
            ratingAfter: 1531,
            winsBefore: 1,
            winsAfter: 2,
            lossesBefore: 0,
            lossesAfter: 0,
            matchesBefore: 1,
            matchesAfter: 2,
          },
          loser: {
            id: 'logo-2',
            name: 'Bravo',
            codename: 'bravo',
            ratingBefore: 1484,
            ratingAfter: 1469,
            winsBefore: 0,
            winsAfter: 0,
            lossesBefore: 1,
            lossesAfter: 2,
            matchesBefore: 1,
            matchesAfter: 2,
          },
        }),
      ]
        .map((line) => `${line}\n`)
        .join(''),
      'utf-8',
    )

    ;({ recalculateContestElo } = await import('../data-store'))
  })

  afterEach(async () => {
    vi.resetModules()
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR
    } else {
      process.env.DATA_DIR = originalDataDir
    }
    await rm(dataDir, { recursive: true, force: true })
  })

  it('detects differences on dry run and persists recalculated ratings when applied', async () => {
    const dryRun = await recalculateContestElo('test-contest', { dryRun: true })

    expect(dryRun.dryRun).toBe(true)
    expect(dryRun.changesDetected).toBe(true)
    expect(dryRun.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          logoId: 'logo-1',
          winsAfter: 2,
          matchesAfter: 2,
        }),
      ]),
    )

    const votesBefore = JSON.parse(
      await readFile(path.join(dataDir, 'votes.json'), 'utf-8'),
    ) as {
      contests: Record<string, { state: { entries: Record<string, { rating: number }> } }>
    }
    expect(votesBefore.contests['test-contest'].state.entries['logo-1'].rating).toBe(1500)

    const applied = await recalculateContestElo('test-contest', { dryRun: false })

  expect(applied.dryRun).toBe(false)
  expect(applied.changesDetected).toBe(true)
  const logoOneDiff = applied.differences.find((diff) => diff.logoId === 'logo-1')
  expect(logoOneDiff).toBeDefined()
  expect(logoOneDiff?.ratingAfter).toBeGreaterThan(logoOneDiff?.ratingBefore ?? 0)

    const votesAfter = JSON.parse(
      await readFile(path.join(dataDir, 'votes.json'), 'utf-8'),
    ) as {
      contests: Record<
        string,
        {
          state: {
            entries: Record<string, { rating: number; wins: number; losses: number; matches: number }>
          }
        }
      >
    }

    const updatedEntry = votesAfter.contests['test-contest'].state.entries['logo-1']
    expect(updatedEntry.rating).toBeGreaterThan(1500)
    expect(updatedEntry.wins).toBe(2)
    expect(updatedEntry.matches).toBe(2)
  })
})
