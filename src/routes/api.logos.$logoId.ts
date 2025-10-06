import { createFileRoute } from '@tanstack/react-router'

import {
  findLogoById,
  getAllLogosIncludingRemoved,
  removeLogo,
  updateLogoMetadata,
} from '../server/data-store'
import type { UpdateLogoInput } from '../lib/logo-utils'

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

          let payload: Record<string, unknown> = {}
          try {
            payload = (await request.json()) as Record<string, unknown>
          } catch (error) {
            console.warn('No JSON payload provided for logo update.', error)
          }

          const updates: UpdateLogoInput = {}
          let hasField = false

          if (typeof payload.name === 'string') {
            const trimmed = payload.name.trim()
            if (!trimmed) {
              return jsonResponse({ message: 'Name cannot be empty.' }, { status: 400 })
            }
            updates.name = trimmed
            hasField = true
          }

          if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
            const value = payload.description
            if (typeof value === 'string' || value === null) {
              updates.description = value
              hasField = true
            } else {
              return jsonResponse(
                { message: 'Description must be a string or null.' },
                { status: 400 },
              )
            }
          }

          if (Object.prototype.hasOwnProperty.call(payload, 'ownerAlias')) {
            const value = payload.ownerAlias
            if (typeof value === 'string' || value === null) {
              updates.ownerAlias = value
              hasField = true
            } else {
              return jsonResponse(
                { message: 'Owner alias must be a string or null.' },
                { status: 400 },
              )
            }
          }

          if (!hasField) {
            return jsonResponse(
              { message: 'No valid fields to update.' },
              { status: 400 },
            )
          }

          const updated = await updateLogoMetadata(
            params.logoId,
            updates,
            contestIdParam ?? fallback?.contestId,
          )
          if (!updated) {
            return jsonResponse({ message: 'Logo not found.' }, { status: 404 })
          }
          return jsonResponse({ logo: updated })
        } catch (error) {
          console.error('Failed to update logo metadata', error)
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
