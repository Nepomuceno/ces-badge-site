import { createFileRoute } from '@tanstack/react-router'

import { getContestMetrics } from '../server/data-store'
import {
  createContest,
  getContestRegistry,
  getActiveContestId,
  setActiveContest,
} from '../server/contest-store'
import type { ContestStatus } from '../lib/contest-utils'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    ...init,
  })
}

interface ContestCreatePayload {
  title?: string
  slug?: string
  subtitle?: string | null
  description?: string | null
  status?: ContestStatus
  startsAt?: string | null
  endsAt?: string | null
  votingOpen?: boolean
  setActive?: boolean
}

export const Route = createFileRoute('/api/contests')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const registry = await getContestRegistry()
          const contests = await Promise.all(
            registry.contests.map(async (contest) => {
              const metrics = await getContestMetrics(contest.id)
              return {
                ...contest,
                ...metrics,
                isActive: contest.id === registry.activeContestId,
              }
            }),
          )

          return jsonResponse({
            activeContestId: registry.activeContestId,
            contests,
          })
        } catch (error) {
          console.error('Failed to load contests', error)
          return jsonResponse(
            { message: 'Failed to load contests.' },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const payload = (await request.json()) as ContestCreatePayload
          const title = typeof payload.title === 'string' ? payload.title.trim() : ''

          if (!title) {
            return jsonResponse(
              { message: 'Contest title is required.' },
              { status: 400 },
            )
          }

          const contest = await createContest({
            title,
            slug: payload.slug,
            subtitle: payload.subtitle,
            description: payload.description,
            status: payload.status,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            votingOpen: payload.votingOpen,
          })

          let updatedContest = contest
          if (payload.setActive && contest.id !== (await getActiveContestId())) {
            updatedContest = await setActiveContest(contest.id)
          }

          const metrics = await getContestMetrics(updatedContest.id)
          const activeContestId = await getActiveContestId()

          return jsonResponse(
            {
              contest: {
                ...updatedContest,
                ...metrics,
                isActive: updatedContest.id === activeContestId,
              },
            },
            { status: 201 },
          )
        } catch (error) {
          console.error('Failed to create contest', error)
          const message =
            error instanceof Error ? error.message : 'Failed to create contest.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
