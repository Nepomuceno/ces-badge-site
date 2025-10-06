import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'

import { ensureDataDir, resolveDataPath } from '../server/storage-utils'

const BUNDLED_ROSTER_PATH = path.resolve(process.cwd(), 'server/data/allowed-users.json')
const PERSISTED_ROSTER_PATH = resolveDataPath('allowed-users.json')

interface AllowedUserRecord {
  alias: string
  email?: string
  name?: string
  role?: string
  logos?: string[]
  passwordHash?: string | null
}

function normalizeAlias(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return ''
  if (!trimmed.includes('@')) return trimmed
  return trimmed.split('@')[0] ?? ''
}

async function ensureRosterFile() {
  await ensureDataDir()
  try {
    await fs.access(PERSISTED_ROSTER_PATH)
    return
  } catch {
    try {
      const bundled = await fs.readFile(BUNDLED_ROSTER_PATH, 'utf-8')
      await fs.writeFile(PERSISTED_ROSTER_PATH, bundled, 'utf-8')
      return
    } catch (error) {
      console.warn('Falling back to empty roster; bundled file missing or unreadable.', error)
    }
    await fs.writeFile(PERSISTED_ROSTER_PATH, '[]\n', 'utf-8')
  }
}

async function readRoster(): Promise<AllowedUserRecord[]> {
  await ensureRosterFile()
  try {
    const content = await fs.readFile(PERSISTED_ROSTER_PATH, 'utf-8')
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed as AllowedUserRecord[]
    }
  } catch (error) {
    console.warn('Failed to read roster file; returning empty roster.', error)
  }
  return []
}

async function writeRoster(records: AllowedUserRecord[]) {
  await ensureRosterFile()
  await fs.writeFile(PERSISTED_ROSTER_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf-8')
}

async function seedRosterFromBundle() {
  await ensureRosterFile()
}

export const Route = createFileRoute('/api/allowed-users')({
  server: {
    handlers: {
      GET: async () => {
        const roster = await readRoster()

        const normalized = Array.isArray(roster) ? roster : []

        return new Response(JSON.stringify(normalized, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      },
  PATCH: async ({ request }: { request: Request }) => {
        try {
          await seedRosterFromBundle()
          const body = (await request.json()) as Partial<AllowedUserRecord>
          const aliasInput = typeof body.alias === 'string' ? body.alias : ''
          const normalizedAlias = normalizeAlias(aliasInput)

          if (!normalizedAlias) {
            return new Response(
              JSON.stringify({ message: 'Alias is required to update roster entry.' }),
              {
                status: 400,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            )
          }

          let records: AllowedUserRecord[] = []

          records = await readRoster()

          const index = records.findIndex((entry) => normalizeAlias(entry.alias) === normalizedAlias)
          if (index === -1) {
            return new Response(
              JSON.stringify({ message: 'Alias not found in roster.' }),
              {
                status: 404,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            )
          }

          const current = { ...records[index] }

          if (typeof body.name === 'string') {
            const trimmedName = body.name.trim()
            if (trimmedName) {
              current.name = trimmedName
            }
          }

          if (Object.prototype.hasOwnProperty.call(body, 'passwordHash')) {
            const nextHash = body.passwordHash
            if (typeof nextHash === 'string' && nextHash.trim()) {
              current.passwordHash = nextHash
            } else {
              delete current.passwordHash
            }
          }

          records[index] = current

          await writeRoster(records)

          return new Response(JSON.stringify(current, null, 2), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          console.error('Failed to update roster entry', error)
          return new Response(
            JSON.stringify({ message: 'Failed to update roster entry.' }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
        }
      },
    },
  },
})
