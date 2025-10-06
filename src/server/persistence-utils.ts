import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { ensureDataDir } from './storage-utils'

const BACKUP_DIR = 'backups'
const DEFAULT_MIN_INTERVAL_MS = 60_000
const DEFAULT_MAX_RETAINED = 120
const lastBackupTimestampByPrefix = new Map<string, number>()

interface WriteOptions {
  filePath: string
  data: unknown
  prefix: string
  minIntervalMs?: number
  maxRetained?: number
  forceBackup?: boolean
}

async function ensureBackupDir(): Promise<string> {
  const dataDir = await ensureDataDir()
  const backupPath = path.join(dataDir, BACKUP_DIR)
  await fs.mkdir(backupPath, { recursive: true })
  return backupPath
}

function parseBackupTimestamp(fileName: string): number | null {
  const [base] = fileName.split('.json')
  if (!base) {
    return null
  }

  const dashIndex = base.indexOf('-')
  if (dashIndex === -1) {
    return null
  }

  const firstSegment = base.slice(0, dashIndex)
  const numeric = Number(firstSegment)
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric
  }

  const isoMatch = base.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/)
  if (isoMatch?.[0]) {
    const iso = isoMatch[0].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, (_match, hh, ss, ms) => `:${hh}:${ss}.${ms}Z`)
    const parsed = Date.parse(iso)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

async function atomicWrite(filePath: string, payload: string): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tempPath, payload, 'utf-8')

  let renamed = false
  try {
  const fileHandle = await fs.open(tempPath, 'r+')
    try {
      await fileHandle.sync()
    } finally {
      await fileHandle.close()
    }

    await fs.rename(tempPath, filePath)
    renamed = true

  const finalHandle = await fs.open(filePath, 'r+')
    try {
      await finalHandle.sync()
    } finally {
      await finalHandle.close()
    }

    if (typeof fsConstants.O_DIRECTORY === 'number') {
      try {
        const dirHandle = await fs.open(path.dirname(filePath), fsConstants.O_DIRECTORY | fsConstants.O_RDONLY)
        try {
          await dirHandle.sync()
        } finally {
          await dirHandle.close()
        }
      } catch (error) {
        console.warn(`Failed to fsync directory for ${filePath}`, error)
      }
    }
  } catch (error) {
    throw error
  } finally {
    if (!renamed) {
      await fs.rm(tempPath, { force: true }).catch(() => {})
    }
  }
}

async function ensureBackupRetention(
  backupDir: string,
  maxRetained: number,
): Promise<void> {
  if (maxRetained <= 0) {
    return
  }

  const entries = await fs.readdir(backupDir, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      timestamp: parseBackupTimestamp(entry.name) ?? 0,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)

  if (files.length <= maxRetained) {
    return
  }

  const toDelete = files.slice(maxRetained)
  await Promise.all(
    toDelete.map((entry) => fs.rm(path.join(backupDir, entry.name), { force: true }).catch(() => {})),
  )
}

export async function writeJsonWithBackup({
  filePath,
  data,
  prefix,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  maxRetained = DEFAULT_MAX_RETAINED,
  forceBackup = false,
}: WriteOptions): Promise<string | null> {
  await ensureBackupDir()
  const payload = `${JSON.stringify(data, null, 2)}\n`

  try {
    await atomicWrite(filePath, payload)
  } catch (error) {
    throw new Error(`Failed to write JSON atomically to ${filePath}: ${(error as Error).message}`)
  }

  const backupDir = path.join(await ensureBackupDir(), prefix)
  await fs.mkdir(backupDir, { recursive: true })
  const existingEntries = await fs
    .readdir(backupDir, { withFileTypes: true })
    .catch(() => [])
  const now = Date.now()

  const diskNewest = existingEntries
    .filter((entry) => entry.isFile())
    .map((entry) => parseBackupTimestamp(entry.name) ?? 0)
    .reduce((latest, value) => Math.max(latest, value), 0)

  if (diskNewest > 0 && !lastBackupTimestampByPrefix.has(prefix)) {
    lastBackupTimestampByPrefix.set(prefix, diskNewest)
  }

  const lastRecorded = lastBackupTimestampByPrefix.get(prefix) ?? 0

  if (!forceBackup && lastRecorded > 0 && now - lastRecorded < Math.max(0, minIntervalMs)) {
    if (process.env.DEBUG_BACKUP_LOG === '1') {
      console.log('[backup-skip]', prefix, { now, lastRecorded, diff: now - lastRecorded })
    }
    await ensureBackupRetention(backupDir, maxRetained)
    return null
  }

  const backupPath = path.join(backupDir, `${now}-${randomUUID()}.json`)

  if (process.env.DEBUG_BACKUP_LOG === '1') {
    console.log('[backup-write]', prefix, { now, lastRecorded, diff: now - lastRecorded, forceBackup })
  }
  try {
    await fs.copyFile(filePath, backupPath)
  } catch (error) {
    console.warn(`Failed to copy backup for ${filePath}`, error)
    return null
  }

  lastBackupTimestampByPrefix.set(prefix, now)
  await ensureBackupRetention(backupDir, maxRetained)
  return backupPath
}

export async function restoreLatestBackup(prefix: string, destination: string): Promise<boolean> {
  try {
    const backupDir = path.join(await ensureBackupDir(), prefix)
    const entries = await fs.readdir(backupDir, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
      .reverse()

    for (const fileName of files) {
      const backupPath = path.join(backupDir, fileName)
      try {
  await fs.copyFile(backupPath, destination)
  const handle = await fs.open(destination, 'r+')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
        return true
      } catch (error) {
        console.warn(`Failed to restore backup ${backupPath}`, error)
      }
    }
  } catch (error) {
    console.warn(`Failed to read backups for prefix ${prefix}`, error)
  }

  return false
}
