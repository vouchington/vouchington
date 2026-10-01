import { Response } from 'undici'
import { expect, vi } from 'vitest'
import type { ClassifierRunExecution } from '../agents/classifier-runs/index.mts'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { listIncompleteClassifierRuns } from '../services/classifier-runs/index.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import type { ClassifierRunFacts } from './data-stores/psql/classifier-runs/run-facts.mts'
import { sentryCaptureMessageMock } from './vitest.setup.sentry-mock.mts'

export type ClassifierFailureRun = {
  runId: string
  /** Runs the currently leased run once against the provider boundary `fetch`. */
  execute(
    fetch: StructuredDecisionFetch,
    options?: { maxAttempts?: number; apiKey?: string },
  ): Promise<ClassifierRunExecution>
  /** Claims the run as a queue retry or the sweep would, returning what the claim found. */
  claim(): Promise<string>
  facts(): Promise<ClassifierRunFacts>
}

export type ClassifierFailureDriver = {
  slug: string
  /** A freshly reserved, leased run with remote work and no local outcome. */
  prepare(): Promise<ClassifierFailureRun>
}

export const DAILY_CAP_MICROUNITS = 1_000_000
export const FLAGGED_INPUT = 'the private post text the moderation provider flagged'
export const OUTAGE = {
  code: 403,
  message: 'Provider returned error',
  metadata: { provider_name: 'Azure' },
}

export type Scenario = [
  name: string,
  status: number,
  error: object,
  headers?: Record<string, string>,
]

export const PERMANENT: Scenario[] = [
  ['401 rejected key', 401, { code: 401, message: 'No auth credentials found' }],
  ['402 out of credits', 402, { code: 402, message: 'Insufficient credits' }],
  ['400 malformed request', 400, { code: 400, message: 'Invalid request' }],
  [
    '403 guardrail block',
    403,
    { code: 403, message: 'Blocked by a guardrail', metadata: { patterns: ['secret'] } },
  ],
]

export const TRANSIENT: Scenario[] = [
  ['403 provider outage', 403, OUTAGE],
  ['429 rate limit', 429, { code: 429, message: 'Rate limited' }, { 'retry-after': '12' }],
  ['503 unavailable', 503, { code: 503, message: 'No provider available' }],
  ['408 timeout', 408, { code: 408, message: 'Request timed out' }],
  [
    '402 in-flight budget',
    402,
    {
      code: 402,
      message: 'Budget in use',
      metadata: { limit_source: 'openrouter_in_flight_budget' },
    },
  ],
]

export function failing(status: number, error: object, headers?: Record<string, string>) {
  return vi.fn<StructuredDecisionFetch>(async () =>
    Response.json({ error }, { status, ...(headers ? { headers } : {}) }),
  )
}

/** A billed, decodable provider answer for every question the request asked. */
export function billed(responseId: string) {
  return vi.fn<StructuredDecisionFetch>(async (_url, init) => {
    const body = JSON.parse(stringFromUnknown(init?.body)) as { questions: Record<string, unknown> }
    return Response.json({
      id: responseId,
      model: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      usage: { input_tokens: 12, output_tokens: 3, cost: 0.002 },
      answers: Object.keys(body.questions).map(id => ({ id, type: 'noul', noul: 0.9 })),
    })
  })
}

export async function incompleteRunIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  let after: string | null = null
  do {
    const page: Awaited<ReturnType<typeof listIncompleteClassifierRuns>> =
      await listIncompleteClassifierRuns(after)
    for (const item of page.items) ids.add(item.runId)
    after = page.next
  } while (after)
  return ids
}

export function expectAlarm(slug: string, kind: string, extra: object) {
  expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith('classifier_run_alarm', {
    level: 'error',
    fingerprint: ['classifier_run_alarm', kind, slug],
    tags: { reason: 'classifier_run_alarm', alarm_kind: kind, classifier: slug },
    extra: { classifier: slug, ...extra },
  })
}
