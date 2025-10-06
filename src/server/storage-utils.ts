import path from 'node:path'
import { promises as fs } from 'node:fs'

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'server/runtime-data')

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  return DATA_DIR
}

export function resolveDataPath(filename: string) {
  return path.join(DATA_DIR, filename)
}
