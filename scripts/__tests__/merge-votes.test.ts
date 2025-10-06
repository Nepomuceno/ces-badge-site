import { describe, expect, it } from 'vitest'

import { mergeContest, type ContestAggregation } from '../merge-votes'
import type { LogoEntry } from '../../src/lib/logo-utils'
import type { MatchHistoryEntry } from '../../src/lib/elo-engine'

describe('mergeContest', () => {
  it('deduplicates matches and recomputes Elo ratings', () => {
    const logos: LogoEntry[] = [
      {
        id: 'alpha',
        contestId: 'badge-arena',
        name: 'Alpha',
        codename: 'alpha',
        description: undefined,
        image: '/logos/alpha.svg',
        assetPath: null,
        ownerAlias: null,
        source: 'catalog',
        submittedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        removedAt: null,
        removedBy: null,
      },
      {
        id: 'beta',
        contestId: 'badge-arena',
        name: 'Beta',
        codename: 'beta',
        description: undefined,
        image: '/logos/beta.svg',
        assetPath: null,
        ownerAlias: null,
        source: 'catalog',
        submittedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        removedAt: null,
        removedBy: null,
      },
    ]

    const matches: MatchHistoryEntry[] = [
      { winnerId: 'alpha', loserId: 'beta', timestamp: 1_000, voterHash: null },
      { winnerId: 'alpha', loserId: 'beta', timestamp: 1_000, voterHash: null }, // duplicate
      { winnerId: 'beta', loserId: 'alpha', timestamp: 4_000, voterHash: null },
    ]

    const aggregation: ContestAggregation = {
      matches,
      latestUpdatedAt: new Date().toISOString(),
      uniqueMatchCount: matches.length,
      duplicateCount: 0,
      inferredEntryMatches: 10,
    }

    const result = mergeContest('badge-arena', aggregation, logos, 100)

    expect(result.matchesApplied).toBe(2)
    expect(result.duplicatesSkipped).toBe(1)
    expect(result.state.history).toHaveLength(2)
    expect(result.state.history[0]).toMatchObject({
      winnerId: 'beta',
      loserId: 'alpha',
      timestamp: 4_000,
    })
    expect(result.state.history[1]).toMatchObject({
      winnerId: 'alpha',
      loserId: 'beta',
      timestamp: 1_000,
    })

    const alpha = result.state.entries.alpha
    const beta = result.state.entries.beta

    expect(alpha.matches).toBe(2)
    expect(beta.matches).toBe(2)

    expect(alpha.wins).toBe(1)
    expect(alpha.losses).toBe(1)
    expect(beta.wins).toBe(1)
    expect(beta.losses).toBe(1)

    expect(alpha.rating).toBeCloseTo(1498.53, 2)
    expect(beta.rating).toBeCloseTo(1501.47, 2)

    expect(result.missingHistoryEstimate).toBe(8)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
