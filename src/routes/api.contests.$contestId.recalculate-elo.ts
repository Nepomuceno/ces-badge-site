import { createFileRoute } from '@tanstack/react-router'

import { recalculateContestElo, getContestMetrics } from '../server/data-store'
import { ensureContest, getActiveContestId } from '../server/contest-store'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    ...init,
  })
}

export const Route = createFileRoute('/api/contests/$contestId/recalculate-elo')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const contestId = (params as Record<string, string>).contestId
          if (!contestId) {
            return jsonResponse({ message: 'Contest identifier missing.' }, { status: 400 })
          }

          let dryRun = false
          try {
            const payload = await request.json()
            if (payload && typeof payload.dryRun === 'boolean') {
              dryRun = payload.dryRun
            }
          } catch (error) {
            // Ignore invalid or missing JSON bodies; default to full recalculation.
          }

          const contest = await ensureContest(contestId)
          const result = await recalculateContestElo(contest.id, { dryRun })
          const metrics = await getContestMetrics(contest.id)
          const activeContestId = await getActiveContestId()

          const contestSummary = {
            ...contest,
            ...metrics,
            isActive: contest.id === activeContestId,
          }

          const summary = {
            totalMatches: result.totalMatches,
            changedCount: result.differences.length,
            changesDetected: result.changesDetected,
            lastMatchAt: result.lastMatchAt,
          }

          const applied = !dryRun && result.changesDetected
          const message = dryRun
            ? result.changesDetected
              ? 'Recalculation preview ready.'
              : 'No changes detected; Elo ratings already aligned with vote history.'
            : result.changesDetected
              ? 'Elo ratings recalculated and persisted.'
              : 'No changes applied; Elo ratings already aligned.'

          return jsonResponse({
            dryRun,
            applied,
            summary,
            differences: result.differences,
            proposedLeaderboard: result.proposedLeaderboard,
            contest: contestSummary,
            message,
          })
        } catch (error) {
          console.error('Failed to recalculate contest Elo', error)
          const message = error instanceof Error ? error.message : 'Failed to recalculate Elo.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
