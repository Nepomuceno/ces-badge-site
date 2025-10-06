import type { LogoVariant } from '../data/logo-catalog'
import { normalizeAlias } from './auth-utils'
import { DEFAULT_CONTEST_ID } from './contest-utils'

export type LogoSource = 'catalog' | 'user'

export interface SubmitLogoInput {
  name: string
  description?: string
  image: string
  submittedBy: string
  ownerAlias?: string | null
  contestId?: string
}

export interface LogoEntry {
  id: string
  contestId: string
  name: string
  codename: string
  description?: string
  image: string
  ownerAlias: string | null
  source: LogoSource
  submittedBy?: string
  createdAt: string
  updatedAt: string
  removedAt?: string | null
  removedBy?: string | null
}

export const BASE_CATALOG_TIMESTAMP = '2024-01-01T00:00:00.000Z'

export function generateCodename(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized : 'logo'
}

export function normalizeOwnerAlias(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return normalizeOwnerAlias(value[0])
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = normalizeAlias(value)
  return normalized.length > 0 ? normalized : null
}

export function createCatalogEntry(logo: LogoVariant, contestId: string = DEFAULT_CONTEST_ID): LogoEntry {
  return {
    id: logo.id,
    contestId,
    name: logo.name,
    codename: generateCodename(logo.name),
    description: logo.description,
    image: logo.image,
    ownerAlias: normalizeOwnerAlias(logo.ownerAlias),
    source: 'catalog',
    submittedBy: 'ces3@system',
    createdAt: BASE_CATALOG_TIMESTAMP,
    updatedAt: BASE_CATALOG_TIMESTAMP,
    removedAt: null,
    removedBy: null,
  }
}

export function sortLogos(logos: LogoEntry[]): LogoEntry[] {
  return [...logos].sort((a, b) => {
    const aRemoved = Boolean(a.removedAt)
    const bRemoved = Boolean(b.removedAt)
    if (aRemoved !== bRemoved) {
      return aRemoved ? 1 : -1
    }

    if (a.source !== b.source) {
      return a.source === 'catalog' ? -1 : 1
    }

    const timeA = new Date(a.createdAt).getTime()
    const timeB = new Date(b.createdAt).getTime()

    if (timeA === timeB) {
      return a.name.localeCompare(b.name)
    }

    return timeB - timeA
  })
}
