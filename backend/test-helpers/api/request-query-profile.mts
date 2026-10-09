import type http from 'node:http'
import { createRequestQueryProfile } from '@data-stores/psql/request-query-profile'
import { formatRequestProfileLine } from '@data-stores/psql/request-query-profile-summary'

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Method and path with query string removed and UUID segments folded to `:id`. */
export function requestProfileRoute(req: http.IncomingMessage): string {
  const path = (req.url ?? '/').split('?')[0]?.replace(UUID_SEGMENT, ':id')
  return `${req.method ?? 'GET'} ${path}`
}

/**
 * Report-only. Runs `handle` inside a per-request PostgreSQL profile scope and writes one
 * `[pg-request-profile]` stderr line when the response finishes and a query annotation repeated
 * (or always, with `PG_REQUEST_PROFILE=all`). Never throws into, or fails, the request. Queries
 * that complete after the response is flushed are not attributed.
 */
export function profileRequestQueries(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handle: () => void,
): void {
  const profile = createRequestQueryProfile()
  res.once('finish', () => {
    try {
      const line = formatRequestProfileLine(requestProfileRoute(req), profile.summarize(), {
        all: process.env.PG_REQUEST_PROFILE === 'all',
      })
      if (line) process.stderr.write(line)
    } catch {
      // Profiling must never affect a test.
    }
  })
  profile.run(handle)
}
