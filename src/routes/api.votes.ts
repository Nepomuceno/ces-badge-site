import { createFileRoute } from '@tanstack/react-router'

import { getEloState, recordVote } from '../server/data-store'

interface VotePayload {
  winnerId: string
  loserId: string
  voterHash?: string | null
  contestId?: string | null
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    ...init,
  })
}

export const Route = createFileRoute('/api/votes')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const contestId = url.searchParams.get('contestId') ?? undefined
        const state = await getEloState(contestId ?? undefined)
        return jsonResponse({ state })
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const payload = (await request.json()) as VotePayload
          if (!payload?.winnerId || !payload?.loserId) {
            return jsonResponse(
              { message: 'winnerId and loserId are required.' },
              { status: 400 },
            )
          }

          const url = new URL(request.url)
          const contestId = payload.contestId ?? url.searchParams.get('contestId') ?? undefined

          const state = await recordVote(
            payload.winnerId,
            payload.loserId,
            payload.voterHash ?? null,
            contestId ?? undefined,
          )
          return jsonResponse({ state })
        } catch (error) {
          console.error('Failed to record vote', error)
          const message = error instanceof Error ? error.message : 'Failed to process vote.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
