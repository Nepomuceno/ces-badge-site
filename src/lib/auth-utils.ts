export function normalizeAlias(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return ''
  if (!trimmed.includes('@')) return trimmed
  return trimmed.split('@')[0] ?? ''
}

export async function sha256Hex(payload: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('SubtleCrypto is not available in this environment.')
  }

  const data = new TextEncoder().encode(payload)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashPasswordWithAlias(password: string, alias: string): Promise<string> {
  const normalizedAlias = normalizeAlias(alias)
  return sha256Hex(`${password}${normalizedAlias}`)
}

const VOTE_HASH_SALT = 'ces3-vote-salt-v1'

export async function hashAliasForVoting(alias: string): Promise<string> {
  const normalizedAlias = normalizeAlias(alias)
  if (!normalizedAlias) {
    return ''
  }
  return sha256Hex(`${normalizedAlias}:${VOTE_HASH_SALT}`)
}
