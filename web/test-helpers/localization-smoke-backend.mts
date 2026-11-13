import { createServer } from 'node:http'
import type { HackerNewsConfig } from '../lib/hacker-news-config'
import { localizationGetResult } from '../../backend/services/localization/resolve.mts'
import { headerValue } from '../../backend/services/localization/query.mts'

const port = Number(process.argv[2])
const host = process.argv[3] ?? '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError('Smoke backend port must be a TCP port')
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  if (request.method !== 'GET') {
    response.writeHead(405).end()
    return
  }
  if (url.pathname === '/health') {
    response.writeHead(200).end('ready')
    return
  }
  if (url.pathname === '/api/v1/hacker-news-config') {
    const config: HackerNewsConfig = { references_visible: true, post_time_range_cap: '1y' }
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'private, no-store')
    response.writeHead(200).end(JSON.stringify(config))
    return
  }
  if (url.pathname !== '/api/v1/localization') {
    response.writeHead(404).end()
    return
  }
  try {
    const result = localizationGetResult(
      Object.fromEntries(url.searchParams),
      headerValue(request.headers['if-none-match']),
    )
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('ETag', result.etag)
    response.setHeader('Cache-Control', 'public')
    response.writeHead(result.status).end(result.body)
  } catch (err) {
    console.error(err)
    response.writeHead(500).end()
  }
})

server.listen(port, host)
