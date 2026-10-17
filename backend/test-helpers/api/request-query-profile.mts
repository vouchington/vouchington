import { readFileSync } from 'node:fs'
import type http from 'node:http'
import {
  findUnbaselinedRepeats,
  formatUnbaselinedRepeats,
  parseRepeatBaseline,
} from '@data-stores/psql/request-query-profile-baseline'
import { createRequestQueryProfile } from '@data-stores/psql/request-query-profile'
import { formatRequestProfileLine } from '@data-stores/psql/request-query-profile-summary'
import { recordRequestQueryProfileViolation } from './request-query-profile-violations.mts'

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const BASELINE = parseRepeatBaseline(
  JSON.parse(
    readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
  ),
)

/** Method and path with query string removed and UUID segments folded to `:id`. */
export function requestProfileRoute(req: http.IncomingMessage): string {
  const path = (req.url ?? '/').split('?')[0]?.replace(UUID_SEGMENT, ':id')
  return `${req.method ?? 'GET'} ${path}`
}

/**
 * Runs `handle` inside a per-request PostgreSQL profile scope. When the response finishes or closes it writes
 * one `[pg-request-profile]` stderr line when `VITEST_DIAGNOSTICS=1`, and records a violation for every repeated annotation
 * missing from `request-query-profile-baseline.json`; the setup file fails the running test with
 * it. Never throws into the request. Queries that complete after the response is flushed are not
 * attributed.
 */
export function profileRequestQueries(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handle: () => void,
): void {
  const profile = createRequestQueryProfile()
  let finalized = false
  const finalize = () => {
    if (finalized) return
    finalized = true
    try {
      const route = requestProfileRoute(req)
      const summary = profile.summarize()
      const unbaselined = findUnbaselinedRepeats(summary.repeats, BASELINE)
      if (unbaselined.length > 0) {
        recordRequestQueryProfileViolation(formatUnbaselinedRepeats(route, unbaselined))
      }
      if (process.env.VITEST_DIAGNOSTICS === '1') {
        const line = formatRequestProfileLine(route, summary, { all: true })
        if (line) process.stderr.write(line)
      }
    } catch {
      // Profiling must never affect a request.
    }
  }
  res.once('finish', finalize)
  res.once('close', finalize)
  profile.run(handle)
}
