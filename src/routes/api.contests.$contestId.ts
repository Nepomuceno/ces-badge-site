import { createFileRoute } from '@tanstack/react-router'

import { getContestMetrics } from '../server/data-store'
import {
  ensureContest,
  getActiveContestId,
  setActiveContest,
  updateContest,
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

interface ContestUpdatePayload {
  title?: string
  slug?: string
  subtitle?: string | null
  description?: string | null
  status?: ContestStatus
  startsAt?: string | null
  endsAt?: string | null
  archivedAt?: string | null
  votingOpen?: boolean
  setActive?: boolean
}

export const Route = createFileRoute('/api/contests/$contestId')({
  server: {
    handlers: {
      GET: async ({ params }: { params: { contestId: string } }) => {
        try {
          const contest = await ensureContest(params.contestId)
          const metrics = await getContestMetrics(contest.id)
          const activeContestId = await getActiveContestId()
          return jsonResponse({
            contest: {
              ...contest,
              ...metrics,
              isActive: contest.id === activeContestId,
            },
          })
        } catch (error) {
          console.error('Failed to load contest', error)
          return jsonResponse(
            { message: 'Contest not found.' },
            { status: 404 },
          )
        }
      },
      PATCH: async ({ params, request }: { params: { contestId: string }; request: Request }) => {
        try {
          const payload = (await request.json()) as ContestUpdatePayload
          const updated = await updateContest(params.contestId, {
            title: payload.title,
            slug: payload.slug,
            subtitle: payload.subtitle,
            description: payload.description,
            status: payload.status,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            archivedAt: payload.archivedAt,
            votingOpen: payload.votingOpen,
            setActive: payload.setActive,
          })

          const finalContest = payload.setActive
            ? await setActiveContest(updated.id)
            : updated

          const metrics = await getContestMetrics(finalContest.id)
          const activeContestId = await getActiveContestId()

          return jsonResponse({
            contest: {
              ...finalContest,
              ...metrics,
              isActive: finalContest.id === activeContestId,
            },
          })
        } catch (error) {
          console.error('Failed to update contest', error)
          const message =
            error instanceof Error ? error.message : 'Failed to update contest.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
