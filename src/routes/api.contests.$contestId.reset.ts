import { createFileRoute } from '@tanstack/react-router'

import { getContestMetrics, resetContestVotes } from '../server/data-store'
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

export const Route = createFileRoute('/api/contests/$contestId/reset')({
  server: {
    handlers: {
      POST: async ({ params }: { params: { contestId: string } }) => {
        try {
          const contest = await ensureContest(params.contestId)
          await resetContestVotes(contest.id)

          const metrics = await getContestMetrics(contest.id)
          const activeContestId = await getActiveContestId()

          return jsonResponse({
            contest: {
              ...contest,
              ...metrics,
              isActive: contest.id === activeContestId,
            },
            message: 'Contest votes reset.',
          })
        } catch (error) {
          console.error('Failed to reset contest votes', error)
          const message =
            error instanceof Error ? error.message : 'Failed to reset contest votes.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
