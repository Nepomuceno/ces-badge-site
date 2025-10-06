import { createFileRoute } from '@tanstack/react-router'

import {
  findLogoById,
  getAllLogosIncludingRemoved,
  removeLogo,
  updateLogoOwner,
} from '../server/data-store'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    ...init,
  })
}

export const Route = createFileRoute('/api/logos/$logoId')({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { logoId: string }; request: Request }) => {
        try {
          const url = new URL(request.url)
          const contestIdParam = url.searchParams.get('contestId') ?? undefined

          let logo = contestIdParam
            ? (await getAllLogosIncludingRemoved(contestIdParam)).find((entry) => entry.id === params.logoId)
            : await findLogoById(params.logoId)

          if (!logo) {
            return jsonResponse({ message: 'Logo not found.' }, { status: 404 })
          }
          return jsonResponse({ logo })
        } catch (error) {
          console.error('Failed to load logo', error)
          return jsonResponse({ message: 'Failed to load logo.' }, { status: 500 })
        }
      },
      PATCH: async ({ params, request }: { params: { logoId: string }; request: Request }) => {
        try {
          const url = new URL(request.url)
          const contestIdParam = url.searchParams.get('contestId') ?? undefined
          const fallback = contestIdParam ? null : await findLogoById(params.logoId)
          const { ownerAlias } = (await request.json()) as { ownerAlias?: string | null }
          const updated = await updateLogoOwner(
            params.logoId,
            ownerAlias ?? null,
            contestIdParam ?? fallback?.contestId,
          )
          if (!updated) {
            return jsonResponse({ message: 'Logo not found.' }, { status: 404 })
          }
          return jsonResponse({ logo: updated })
        } catch (error) {
          console.error('Failed to update logo owner', error)
          const message = error instanceof Error ? error.message : 'Failed to update logo.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
      DELETE: async ({ params, request }: { params: { logoId: string }; request: Request }) => {
        try {
          let removedBy: string | null = null
          try {
            const payload = (await request.json()) as { removedBy?: string | null }
            removedBy = payload?.removedBy ?? null
          } catch (error) {
            // Ignore body parse errors for DELETE with no payload
          }

          const url = new URL(request.url)
          const contestIdParam = url.searchParams.get('contestId') ?? undefined
          const fallback = contestIdParam ? null : await findLogoById(params.logoId)

          const updated = await removeLogo(
            params.logoId,
            removedBy,
            contestIdParam ?? fallback?.contestId,
          )
          if (!updated) {
            return jsonResponse({ message: 'Logo not found.' }, { status: 404 })
          }
          return jsonResponse({ logo: updated })
        } catch (error) {
          console.error('Failed to remove logo', error)
          const message =
            error instanceof Error ? error.message : 'Failed to remove logo.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
