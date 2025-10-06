import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ISO_NOW = '2024-01-01T00:00:00.000Z'

let recordVote: typeof import('../data-store').recordVote
let resetContestVotes: typeof import('../data-store').resetContestVotes

describe('vote audit logging', () => {
  let dataDir: string
  let originalDataDir: string | undefined

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'ces3-audit-'))
    originalDataDir = process.env.DATA_DIR
    process.env.DATA_DIR = dataDir

    vi.useFakeTimers()
    vi.setSystemTime(new Date(ISO_NOW))
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

    ;({ recordVote, resetContestVotes } = await import('../data-store'))
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

  it('writes audit events when votes are recorded and resets occur', async () => {
    await recordVote('logo-1', 'logo-2', 'hash-123', 'test-contest')

    const logPath = path.join(dataDir, 'vote-events.ndjson')
    const recordedRaw = await readFile(logPath, 'utf-8')
    const recordedEvents = recordedRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    expect(recordedEvents).toHaveLength(1)
    const voteEvent = recordedEvents[0]

    expect(voteEvent).toMatchObject({
      type: 'vote-recorded',
      contestId: 'test-contest',
      voterHash: 'hash-123',
      matchTimestamp: new Date(ISO_NOW).getTime(),
      winner: {
        id: 'logo-1',
        name: 'Alpha',
        codename: 'alpha',
      },
      loser: {
        id: 'logo-2',
        name: 'Bravo',
        codename: 'bravo',
      },
    })

    expect(voteEvent.matchHistoryLength).toBe(1)
    expect(voteEvent.winner.ratingAfter).toBeGreaterThan(voteEvent.winner.ratingBefore)
    expect(voteEvent.loser.ratingAfter).toBeLessThan(voteEvent.loser.ratingBefore)

    await resetContestVotes('test-contest')

    const afterResetRaw = await readFile(logPath, 'utf-8')
    const allEvents = afterResetRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    expect(allEvents).toHaveLength(2)
    const resetEvent = allEvents[1]

    expect(resetEvent).toMatchObject({
      type: 'votes-reset',
      contestId: 'test-contest',
      reason: 'manual-reset',
      previousMatchCount: 1,
    })

    expect(resetEvent.initiator).toBeNull()
  })
})
