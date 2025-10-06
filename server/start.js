import http from 'node:http'
import { Readable } from 'node:stream'
import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import startServer from '../dist/server/server.js'

const port = Number.parseInt(process.env.PORT ?? '80', 10)

const handler = startServer?.default ?? startServer

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distClientDir = path.resolve(__dirname, '../dist/client')
const publicDir = path.resolve(__dirname, '../public')

const mimeTypes = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
}

const isWithin = (base, target) => {
  const rel = path.relative(base, target)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

const resolveStaticPath = async (requestPath) => {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0])
  const normalized = path.posix.normalize(cleanPath)
  const relativePath = normalized.replace(/^\//, '')

  if (!relativePath) {
    return null
  }

  const candidatePaths = [
    path.join(distClientDir, relativePath),
    path.join(publicDir, relativePath),
  ]

  for (const candidate of candidatePaths) {
    const baseDir = candidate.startsWith(distClientDir) ? distClientDir : publicDir
    if (!isWithin(baseDir, candidate)) continue

    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) {
        return candidate
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        console.warn('Static file check failed:', error)
      }
    }
  }

  return null
}

const serveStatic = async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) {
    return false
  }

  const pathname = new URL(req.url ?? '/', `http://localhost`).pathname

  // Directory roots should not be served as static files here
  if (pathname === '/' || pathname === '') {
    return false
  }

  const filePath = await resolveStaticPath(pathname)

  if (!filePath) {
    return false
  }

  const extension = path.extname(filePath).toLowerCase()
  const contentType = mimeTypes[extension] ?? 'application/octet-stream'

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': extension.match(/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|avif)$/)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  })

  if (req.method === 'HEAD') {
    res.end()
    return true
  }

  createReadStream(filePath).pipe(res)
  return true
}

if (!handler?.fetch) {
  throw new Error('SSR server export missing `fetch` handler. Did the build succeed?')
}

const server = http.createServer(async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] ?? 'http'
    const host = req.headers.host ?? `localhost:${port}`
    const url = new URL(req.url ?? '/', `${protocol}://${host}`)

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry !== undefined) headers.append(key, entry)
        })
      } else {
        headers.set(key, value)
      }
    }

    const method = req.method ?? 'GET'
    const hasBody = method !== 'GET' && method !== 'HEAD'
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
    })

    if (await serveStatic(req, res)) {
      return
    }

    const response = await handler.fetch(request)

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))

    if (!response.body) {
      const body = await response.text()
      res.end(body)
      return
    }

    const readable = Readable.fromWeb(response.body)
    readable.pipe(res)
  } catch (error) {
    console.error('Request handling failed', error)
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' })
    }
    res.end('Internal Server Error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`)
})
