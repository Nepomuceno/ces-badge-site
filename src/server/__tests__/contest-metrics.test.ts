import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ISO_NOW = '2024-01-01T00:00:00.000Z'
const LAST_MATCH_TIMESTAMP = 1_700_001_000_000

let getContestMetrics: typeof import('../data-store').getContestMetrics

describe('getContestMetrics', () => {
  let dataDir: string
  let originalDataDir: string | undefined

  beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'ces3-metrics-'))
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
              status: 'archived',
              createdAt: ISO_NOW,
              updatedAt: ISO_NOW,
              startsAt: ISO_NOW,
              endsAt: ISO_NOW,
              archivedAt: ISO_NOW,
              votingOpen: false,
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
          version: 2,
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
                  'logo-1': { rating: 1600, wins: 3, losses: 1, matches: 4 },
                  'logo-2': { rating: 1400, wins: 1, losses: 3, matches: 4 },
                },
                history: [
                  { winnerId: 'logo-1', loserId: 'logo-2', timestamp: 1_700_000_000_000, voterHash: null },
                  { winnerId: 'logo-2', loserId: 'logo-1', timestamp: LAST_MATCH_TIMESTAMP, voterHash: null },
                ],
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
    ;({ getContestMetrics } = await import('../data-store'))
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

  it('returns leaderboard data and last match timestamp', async () => {
    const metrics = await getContestMetrics('test-contest')

    expect(metrics.logoCount).toBe(2)
    expect(metrics.matchCount).toBe(2)
    expect(metrics.lastMatchAt).toBe(new Date(LAST_MATCH_TIMESTAMP).toISOString())

    expect(metrics.leaderboard).toHaveLength(2)
    expect(metrics.leaderboard[0]).toMatchObject({
      logoId: 'logo-1',
      logoName: 'Alpha',
      logoCodename: 'alpha',
      rating: 1600,
      wins: 3,
      losses: 1,
      matches: 4,
    })
    expect(metrics.leaderboard[1]).toMatchObject({
      logoId: 'logo-2',
      logoName: 'Bravo',
      rating: 1400,
    })
  })
})
