// This alias satisfies both the backend fetch guard and oxlint's no-duplicate-imports rule.
import { Agent, Dispatcher, fetch as undiciFetch } from 'undici'
import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import onError from '@modules/on-error'
import {
  createPinnedDispatcherCache,
  type PinnedDispatcherCache,
  type ResolvedSafeAddress,
} from 'ssrf-guard/node'
import { createEgressGuardrailInterceptor } from './http-egress-guardrail.mts'

// Single seam for all backend fetch traffic (ast-grep-enforced; no bare global fetch). Routine
// requests use a protective header backstop. AI providers use the explicitly named long-running
// profile because non-streaming generation can validly delay response headers.
export const EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS = 60_000
export const LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS = 300_000
// MUST stay generous for both profiles: bodyTimeout is the maximum gap between body chunks, not a
// total request deadline, and a tight value would abort sparse LLM streams mid-response.
export const EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS = 300_000
export const EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS = 4_000
export const EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS = 600_000
export const EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS = 10_000

function createExternalRequestDispatcher(headersTimeout: number): Agent {
  return new Agent({
    connections: 5,
    headersTimeout,
    bodyTimeout: EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
    keepAliveTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
    keepAliveMaxTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
    connect: { timeout: EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS },
  })
}

const PINNED_DISPATCHER_CACHE_OPTIONS = {
  maxSize: 100,
  connections: 5,
  headersTimeout: EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  bodyTimeout: EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
  keepAliveTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
  keepAliveMaxTimeout: EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
  connect: { timeout: EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS },
}

let externalRequestDispatcher = createExternalRequestDispatcher(
  EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
)
let longRunningExternalRequestDispatcher = createExternalRequestDispatcher(
  LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
)
let pinnedDispatcherCache = createPinnedRequestDispatcherCache()

let closePromise: Promise<void> | null = null
let apiEgressGuardrailEnabled = false
let guardedDispatcherCache = new WeakMap<Dispatcher, Dispatcher>()

/** Enables the API egress guardrail in the API process only; workers need arbitrary IPv4 egress. */
export function enableApiEgressGuardrail(): void {
  apiEgressGuardrailEnabled = true
}

export function getExternalRequestDispatcher(): Dispatcher {
  return getGuardedDispatcher(externalRequestDispatcher)
}

export function getLongRunningExternalRequestDispatcher(): Dispatcher {
  return getGuardedDispatcher(longRunningExternalRequestDispatcher)
}

// Stable SDK fetches resolve the current guarded dispatcher, so resets cannot retain a closed Agent.
type ExternalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const externalFetch = createExternalFetch(getExternalRequestDispatcher)
const longRunningExternalFetch = createExternalFetch(getLongRunningExternalRequestDispatcher)

export function getExternalFetch(): ExternalFetch {
  return externalFetch
}

export function getLongRunningExternalFetch(): ExternalFetch {
  return longRunningExternalFetch
}

function createExternalFetch(getDispatcher: () => Dispatcher): ExternalFetch {
  // Ambient and package `Request` declarations have version-skewed types but describe the same
  // Undici-backed WHATWG runtime object, so this cast has no behavioral effect.
  return (input, init) => {
    const undiciInit = init as Parameters<typeof undiciFetch>[1]
    const dispatcher = undiciInit?.dispatcher
      ? getGuardedDispatcher(undiciInit.dispatcher)
      : getDispatcher()
    // Response version-skew; same rationale as the `input` cast above — no behavioral effect.
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...undiciInit,
      dispatcher,
    }) as unknown as Promise<Response>
  }
}

export function getPinnedRequestDispatcher(resolvedAddresses: ResolvedSafeAddress[]): Dispatcher {
  return pinnedDispatcherCache.get(resolvedAddresses)
}

export function closeHttpDispatchers(): Promise<void> {
  if (closePromise) return closePromise

  closePromise = Promise.all([
    closeDispatcherIgnoringErrors(externalRequestDispatcher),
    closeDispatcherIgnoringErrors(longRunningExternalRequestDispatcher),
    pinnedDispatcherCache.close(),
  ]).then(() => undefined)

  return closePromise
}

addGracefulShutdownDrainCallback(closeHttpDispatchers)

/**
 * Test-only: installs fresh shared agents, closes both replaced agents, and clears guarded state.
 * Await from `afterEach` so vitest's `isolate: false` workers neither reuse nor leak prior agents.
 */
export async function resetHttpDispatchersForTest(): Promise<void> {
  const previousExternalDispatcher = externalRequestDispatcher
  const previousLongRunningDispatcher = longRunningExternalRequestDispatcher
  const previousPinnedDispatcherCache = pinnedDispatcherCache
  apiEgressGuardrailEnabled = false
  guardedDispatcherCache = new WeakMap()
  closePromise = null
  externalRequestDispatcher = createExternalRequestDispatcher(
    EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  )
  longRunningExternalRequestDispatcher = createExternalRequestDispatcher(
    LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  )
  pinnedDispatcherCache = createPinnedRequestDispatcherCache()
  await Promise.all([
    closeDispatcherIgnoringErrors(previousExternalDispatcher),
    closeDispatcherIgnoringErrors(previousLongRunningDispatcher),
    previousPinnedDispatcherCache.close(),
  ])
}

function closeDispatcherIgnoringErrors(dispatcher: Dispatcher): Promise<void> {
  return dispatcher.close().catch(onError)
}

function getGuardedDispatcher(dispatcher: Dispatcher): Dispatcher {
  if (!apiEgressGuardrailEnabled) return dispatcher
  const cached = guardedDispatcherCache.get(dispatcher)
  if (cached) return cached
  const guarded = dispatcher.compose([createEgressGuardrailInterceptor()])
  guardedDispatcherCache.set(dispatcher, guarded)
  return guarded
}

function createPinnedRequestDispatcherCache(): PinnedDispatcherCache {
  return createPinnedDispatcherCache(PINNED_DISPATCHER_CACHE_OPTIONS)
}
