import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { handler as imageHandler } from './image-resize/index.mts'
import { httpRequestToLambdaEvent } from './image-resize/http-request-to-lambda-event.mts'
import {
  isPlaywrightPodcastCoverRequest,
  PLAYWRIGHT_PODCAST_COVER,
} from './playwright-podcast-cover.mts'

const PORT = Number(process.env.IMAGE_LAMBDA_PORT) || 3100

export const server = http.createServer(async (req, res) => {
  const start = Date.now()
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

  res.on('finish', () => {
    if (pathname !== '/health' && process.env.LOG_LEVEL === 'info') {
      console.log('%s %s %d %dms', req.method, pathname, res.statusCode, Date.now() - start)
    }
  })

  if (pathname === '/health') {
    req.resume()
    res.statusCode = 200
    res.end('ok')
    return
  }

  if (isPlaywrightPodcastCoverRequest(pathname)) {
    req.resume()
    res.statusCode = 200
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'image/png')
    res.end(PLAYWRIGHT_PODCAST_COVER)
    return
  }

  if (req.method !== 'GET') {
    req.resume()
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  try {
    const event = httpRequestToLambdaEvent(req)
    const result = await imageHandler(event)

    for (const [key, value] of Object.entries(result.headers || {})) {
      res.setHeader(key, String(value))
    }
    for (const [key, values] of Object.entries(result.multiValueHeaders || {})) {
      res.setHeader(key, values.map(String))
    }

    res.statusCode = result.statusCode

    if (result.isBase64Encoded) {
      res.end(Buffer.from(result.body, 'base64'))
    } else {
      res.end(result.body)
    }
  } catch (error) {
    console.error('Lambda dev server error:', req.method, req.url, error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

// No 'error' listener: a bind failure such as EADDRINUSE crashes the process with the
// error on stderr, which the image-lambda smoke test greps to reallocate a port.
export function listen(target: http.Server, port: number): void {
  target.listen(port, () => {
    console.log(`Lambda dev server: http://localhost:${port}`)
    console.log('  GET  /images/{key}         — image resize')
    console.log('  GET  /sideload/{base64url}  — sideload image resize')
    console.log('  GET  /og/{base64url}        — OG/Twitter share-card render')
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /* c8 ignore next -- entry-point guard never executes under import-based tests */
  listen(server, PORT)
}
