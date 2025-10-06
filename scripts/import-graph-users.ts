#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export interface AllowedUser {
  alias: string
  email: string
  name: string
  role: 'admin' | 'member'
  logos?: string[]
  passwordHash?: string | null
}

interface CliOptions {
  token: string
  heads: string[]
  adminHeads: string[]
  file: string
  dryRun: boolean
  includeManagers: boolean
}

type GraphUser = {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
}

type GraphListResponse = {
  value: Array<GraphUser & { ['@odata.type']?: string }>
  '@odata.nextLink'?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    token: '',
    heads: [],
    adminHeads: [],
    file: path.resolve('server/data/allowed-users.json'),
    dryRun: false,
    includeManagers: true,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--token':
        options.token = argv[++i] ?? ''
        break
      case '--head':
      case '--manager':
        options.heads.push((argv[++i] ?? '').toLowerCase())
        break
      case '--admin-head':
        options.adminHeads.push((argv[++i] ?? '').toLowerCase())
        break
      case '--file':
        options.file = path.resolve(argv[++i] ?? options.file)
        break
      case '--no-include-managers':
        options.includeManagers = false
        break
      case '--dry-run':
        options.dryRun = true
        break
      default:
        if (arg.startsWith('--token=')) {
          options.token = arg.split('=')[1] ?? ''
        } else if (arg.startsWith('--head=')) {
          options.heads.push(arg.split('=')[1]?.toLowerCase() ?? '')
        } else if (arg.startsWith('--manager=')) {
          options.heads.push(arg.split('=')[1]?.toLowerCase() ?? '')
        } else if (arg.startsWith('--admin-head=')) {
          options.adminHeads.push(arg.split('=')[1]?.toLowerCase() ?? '')
        } else if (arg.startsWith('--file=')) {
          options.file = path.resolve(arg.split('=')[1] ?? options.file)
        } else if (arg === '--help' || arg === '-h') {
          printHelp()
          process.exit(0)
        } else {
          console.warn(`Ignoring unknown argument: ${arg}`)
        }
    }
  }

  if (!options.token) {
    throw new Error('Missing required --token <GRAPH_TOKEN> argument.')
  }

  if (options.heads.length === 0) {
    throw new Error('Provide at least one --head <managerUPN> argument.')
  }

  if (options.adminHeads.length === 0) {
    options.adminHeads = [...options.heads]
  }

  return options
}

function printHelp() {
  console.log(`Usage: bun scripts/import-graph-users.ts --token <GRAPH_TOKEN> --head <managerUPN> [--head <managerUPN> ...]

Options:
  --token <GRAPH_TOKEN>       OAuth token for Microsoft Graph with User.Read.All / Directory.Read.All scopes
  --head <managerUPN>         Manager user principal name (can be repeated)
  --admin-head <managerUPN>   Manager UPNs that should retain admin role (defaults to all heads)
  --file <path>               Path to allowed-users.json (default: server/data/allowed-users.json)
  --dry-run                   Show the changes without writing the file
  --no-include-managers       Skip adding the heads themselves to the roster
  --help                      Show this message
`)
}

async function graphRequest<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Graph request failed (${response.status}): ${body}`)
  }

  return (await response.json()) as T
}

async function getUserByUpn(token: string, upn: string): Promise<GraphUser> {
  const encoded = encodeURIComponent(upn)
  return graphRequest<GraphUser>(token, `${GRAPH_BASE}/users/${encoded}?$select=id,displayName,mail,userPrincipalName`)
}

async function listDirectReports(token: string, id: string): Promise<GraphUser[]> {
  const results: GraphUser[] = []
  let next = `${GRAPH_BASE}/users/${id}/directReports?$select=id,displayName,mail,userPrincipalName`

  while (next) {
    const data = await graphRequest<GraphListResponse>(token, next)
    for (const entry of data.value) {
      // When using $select the @odata.type discriminator is omitted, so fall back to assuming user objects.
      if (entry['@odata.type']?.toLowerCase() === '#microsoft.graph.user' || !entry['@odata.type']) {
        results.push(entry)
      }
    }
    next = data['@odata.nextLink'] ?? ''
  }

  return results
}

async function collectHierarchy(token: string, manager: GraphUser): Promise<GraphUser[]> {
  const seen = new Set<string>()
  const queue: GraphUser[] = [manager]
  const collected: GraphUser[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current.id)) continue
    seen.add(current.id)

    const reports = await listDirectReports(token, current.id)
    for (const report of reports) {
      if (!seen.has(report.id)) {
        queue.push(report)
        collected.push(report)
      }
    }
  }

  return collected
}

function toAlias(upn?: string | null): string | null {
  if (!upn) return null
  const [alias] = upn.split('@')
  return alias?.toLowerCase() ?? null
}

function toEmail(preferred?: string | null, fallback?: string | null): string {
  const value = preferred ?? fallback ?? ''
  return value || `${toAlias(fallback ?? preferred) ?? 'unknown'}@microsoft.com`
}

interface MergeResult {
  added: string[]
  updated: string[]
}

export function mergeRoster(
  current: AllowedUser[],
  incoming: Map<string, AllowedUser>,
  adminAliases: Set<string>
): MergeResult {
  const currentMap = new Map(current.map((user) => [user.alias.toLowerCase(), user]))
  const added: string[] = []
  const updated: string[] = []

  for (const [alias, record] of incoming) {
    const existing = currentMap.get(alias)
    const desiredRole = adminAliases.has(alias) ? 'admin' : 'member'

    if (!existing) {
      currentMap.set(alias, {
        ...record,
        role: desiredRole,
        logos: record.logos ?? [],
      })
      added.push(alias)
      continue
    }

    const role = existing.role === 'admin' ? 'admin' : desiredRole
    const merged: AllowedUser = {
      ...existing,
      name: record.name || existing.name,
      email: record.email || existing.email,
      role,
      logos: existing.logos,
      passwordHash: existing.passwordHash,
    }

    currentMap.set(alias, merged)
    updated.push(alias)
  }

  const mergedList = Array.from(currentMap.values()).sort((a, b) => a.alias.localeCompare(b.alias))
  current.splice(0, current.length, ...mergedList)

  return { added, updated }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const adminAliases = new Set<string>(options.adminHeads.map((alias) => alias.toLowerCase()))
  const incoming = new Map<string, AllowedUser>()

  for (const headUpn of options.heads) {
    const headUser = await getUserByUpn(options.token, headUpn)
  const headAlias = toAlias(headUser.userPrincipalName ?? headUser.mail)
    if (!headAlias) {
      console.warn(`Skipping manager ${headUpn}: missing alias`)
      continue
    }

    if (options.includeManagers) {
      incoming.set(headAlias, {
        alias: headAlias,
        email: toEmail(headUser.mail, headUser.userPrincipalName),
        name: headUser.displayName ?? headAlias,
        role: 'admin',
      })
      adminAliases.add(headAlias)
    }

    const reports = await collectHierarchy(options.token, headUser)
    for (const report of reports) {
  const alias = toAlias(report.userPrincipalName ?? report.mail)
      if (!alias) continue
      if (incoming.has(alias)) continue

      incoming.set(alias, {
        alias,
        email: toEmail(report.mail, report.userPrincipalName),
        name: report.displayName ?? alias,
        role: 'member',
      })
    }
  }

  let roster: AllowedUser[] = []
  try {
    const fileContents = await readFile(options.file, 'utf8')
    roster = JSON.parse(fileContents)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Roster file not found at ${options.file}. A new one will be created.`)
    } else {
      throw error
    }
  }

  const { added, updated } = mergeRoster(roster, incoming, adminAliases)

  if (options.dryRun) {
    console.log('[dry-run] Users to add:', added)
    console.log('[dry-run] Users to update:', updated)
    return
  }

  await writeFile(options.file, `${JSON.stringify(roster, null, 2)}\n`, 'utf8')

  console.log(`Updated roster at ${options.file}`)
  if (added.length) {
    console.log(`Added ${added.length} users: ${added.join(', ')}`)
  }
  if (updated.length) {
    console.log(`Updated ${updated.length} users: ${updated.join(', ')}`)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
