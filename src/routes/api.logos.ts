import { createFileRoute } from '@tanstack/react-router'

import { addLogo, getAllLogosIncludingRemoved } from '../server/data-store'
import { type SubmitLogoInput } from '../lib/logo-utils'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    ...init,
  })
}

export const Route = createFileRoute('/api/logos')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url)
          const contestId = url.searchParams.get('contestId') ?? undefined
          const logos = await getAllLogosIncludingRemoved(contestId ?? undefined)
          return jsonResponse({ logos })
        } catch (error) {
          console.error('Failed to load logos', error)
          return jsonResponse(
            { message: 'Failed to load logos.' },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const payload = (await request.json()) as SubmitLogoInput
          const logo = await addLogo(payload)
          return jsonResponse({ logo }, { status: 201 })
        } catch (error) {
          console.error('Failed to add logo', error)
          const message = error instanceof Error ? error.message : 'Failed to add logo.'
          return jsonResponse({ message }, { status: 400 })
        }
      },
    },
  },
})
