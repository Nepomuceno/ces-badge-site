import { createFileRoute } from '@tanstack/react-router'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { findLogoById } from '../server/data-store'
import { resolveDataPath } from '../server/storage-utils'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
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

export const Route = createFileRoute('/api/logos/$logoId/image')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const logoId = (params as Record<string, string>).logoId
          if (!logoId) {
            return jsonResponse({ message: 'Logo identifier missing.' }, { status: 400 })
          }

          const logo = await findLogoById(logoId)

          if (!logo) {
            return new Response('Not found', { status: 404 })
          }

          if (logo.source !== 'user' || !logo.assetPath) {
            if (logo.image && !logo.image.startsWith('/api/logos/')) {
              return new Response(null, {
                status: 302,
                headers: {
                  Location: logo.image,
                },
              })
            }

            return new Response('Not found', { status: 404 })
          }

          const absolutePath = resolveDataPath(logo.assetPath)
          let data: Buffer
          try {
            data = await fs.readFile(absolutePath)
          } catch (error: unknown) {
            if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
              return jsonResponse({ message: 'Logo asset missing.' }, { status: 404 })
            }
            throw error
          }

          const payload = new ArrayBuffer(data.byteLength)
          new Uint8Array(payload).set(data)

          return new Response(payload, {
            headers: {
              'Content-Type': getContentType(absolutePath),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        } catch (error) {
          console.error('Failed to serve logo image', error)
          return jsonResponse({ message: 'Failed to load logo image.' }, { status: 500 })
        }
      },
    },
  },
})
