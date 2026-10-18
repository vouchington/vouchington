import { readFileSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import type http from 'node:http'
import {
  findUnbaselinedRepeats,
  formatUnbaselinedRepeats,
  parseRepeatBaseline,
} from '@data-stores/psql/request-query-profile-baseline'
import {
  createRequestQueryProfile,
  type RequestQueryProfile,
} from '@data-stores/psql/request-query-profile'
import { formatRequestProfileLine } from '@data-stores/psql/request-query-profile-summary'
import { recordRequestQueryProfileViolation } from './request-query-profile-violations.mts'

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

// State lives on globalThis because `vi.resetModules()` re-evaluates this module for server.mts.
type RequestScope = { route: string; splitToolCalls: boolean }
const SCOPES_KEY = Symbol.for('voucha.apiTestRequestScopes')
const scopesGlobal = globalThis as typeof globalThis & {
  [SCOPES_KEY]?: AsyncLocalStorage<RequestScope>
}
scopesGlobal[SCOPES_KEY] ??= new AsyncLocalStorage<RequestScope>()
const requestScopes = scopesGlobal[SCOPES_KEY]

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
  const route = requestProfileRoute(req)
  let finalized = false
  const finalize = () => {
    if (finalized) return
    finalized = true
    reportRequestQueryProfile(route, profile)
  }
  res.once('finish', finalize)
  res.once('close', finalize)
  requestScopes.run({ route, splitToolCalls: false }, () => profile.run(handle))
}

function reportRequestQueryProfile(route: string, profile: RequestQueryProfile): void {
  try {
    const summary = profile.summarize()
    const unbaselined = findUnbaselinedRepeats(route, summary.repeats, BASELINE)
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

/** Marks the running request so each of its MCP tool calls is profiled as its own unit. */
export function splitMcpToolCallProfiles(): void {
  const scope = requestScopes.getStore()
  if (scope) scope.splitToolCalls = true
}

/**
 * Profiles one tool call of a multi-call MCP JSON-RPC request as if it were a separate request:
 * independent calls own their results, errors and client retries, so a query repeated across
 * calls is not a repeat. A repeat inside the call still fails. Outside a split request it runs
 * `run` unchanged, so single-call requests keep the preamble in one profile.
 */
export async function profileMcpToolCall<Result>(
  toolName: string,
  run: () => Promise<Result>,
): Promise<Result> {
  const scope = requestScopes.getStore()
  if (!scope?.splitToolCalls) return run()
  const profile = createRequestQueryProfile()
  try {
    return await profile.run(run)
  } finally {
    reportRequestQueryProfile(`${scope.route} tools/call ${toolName}`, profile)
  }
}
