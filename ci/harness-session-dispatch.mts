import { AutoHarnessClient } from 'auto-harness-client'
import {
  type ActionEnvironment,
  type DispatchResult,
  HarnessDispatchError,
  parseConcurrencyId,
  parseHarnessApiOrigin,
  parseHarnessFallbacks,
  parseHarnessTarget,
  parseInteger,
  parseMetadata,
  parseRequiredLabels,
  requiredEnvironmentValue,
  writeOutputs,
} from 'auto-harness-client/actions'

import { withSingleRetry } from './harness-dispatch-retry.mts'
import { HARNESS_SESSION_ID } from './shepherd-checkpoint.mts'

export { HarnessDispatchError }

const MAX_PROMPT_BYTES = 65_536
const MAX_QUEUE_TTL_SECONDS = 30 * 24 * 60 * 60

export interface HarnessDispatchEnvironment extends ActionEnvironment {
  GITHUB_ACTIONS?: string
  GITHUB_OUTPUT?: string
  GITHUB_STEP_SUMMARY?: string
  HARNESS_API_KEY?: string
  HARNESS_CONCURRENCY_ID?: string
  HARNESS_DISPATCH_ENABLED?: string
  HARNESS_FALLBACKS?: string
  HARNESS_METADATA?: string
  HARNESS_PRIORITY?: string
  HARNESS_PROMPT?: string
  HARNESS_QUEUE_TTL_SECONDS?: string
  HARNESS_REF?: string
  HARNESS_REPOSITORY_ID?: string
  HARNESS_REQUIRED_LABELS?: string
  HARNESS_RESUME_SESSION_ID?: string
  HARNESS_TARGET?: string
  HARNESS_TIMEOUT?: string
  HARNESS_URL?: string
}

export async function dispatchHarnessSession(
  environment: HarnessDispatchEnvironment,
  fetchImplementation: typeof fetch = fetch,
): Promise<DispatchResult> {
  if (environment.HARNESS_DISPATCH_ENABLED !== 'true') {
    throw new HarnessDispatchError(
      'DISPATCH_DISABLED',
      'Auto Harness dispatch is disabled; no prompt or metadata was transferred',
    )
  }

  const baseUrl = parseHarnessApiOrigin(environment)
  const apiKey = requiredEnvironmentValue(environment, 'HARNESS_API_KEY')
  const prompt = requiredEnvironmentValue(environment, 'HARNESS_PROMPT')
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) {
    throw new HarnessDispatchError('PROMPT_TOO_LARGE', 'HARNESS_PROMPT exceeds 65536 bytes')
  }
  const concurrencyId = parseConcurrencyId(environment.HARNESS_CONCURRENCY_ID)
  const timeout = parseInteger(environment.HARNESS_TIMEOUT, 'HARNESS_TIMEOUT', 1)
  const priority = parseInteger(environment.HARNESS_PRIORITY, 'HARNESS_PRIORITY', 0) ?? 0
  const repositoryId = requiredEnvironmentValue(environment, 'HARNESS_REPOSITORY_ID')
  const client = new AutoHarnessClient({
    apiKey,
    baseUrl: baseUrl.origin,
    fetch: fetchImplementation,
  })

  const resumeSessionId = environment.HARNESS_RESUME_SESSION_ID?.trim()
  if (resumeSessionId) {
    if (!HARNESS_SESSION_ID.test(resumeSessionId)) {
      throw new HarnessDispatchError(
        'INVALID_RESUME_SESSION_ID',
        'HARNESS_RESUME_SESSION_ID contains unsupported characters',
      )
    }
    const resumed = await withSingleRetry(() =>
      client.resumeSession(resumeSessionId, {
        concurrencyId,
        priority,
        prompt,
        ...(timeout === undefined ? {} : { timeout }),
      }),
    )
    const result = { created: resumed.created, id: resumed.id, url: resumed.url }
    writeOutputs(environment, result)
    return result
  }

  if (timeout === undefined) {
    throw new HarnessDispatchError('MISSING_ENVIRONMENT_VALUE', 'HARNESS_TIMEOUT is required')
  }
  const target = parseHarnessTarget(requiredEnvironmentValue(environment, 'HARNESS_TARGET'))
  const fallbacks = parseHarnessFallbacks(environment.HARNESS_FALLBACKS)
  const queueTtlSeconds = parseInteger(
    requiredEnvironmentValue(environment, 'HARNESS_QUEUE_TTL_SECONDS'),
    'HARNESS_QUEUE_TTL_SECONDS',
    1,
  )
  if (queueTtlSeconds === undefined) {
    throw new HarnessDispatchError(
      'MISSING_ENVIRONMENT_VALUE',
      'HARNESS_QUEUE_TTL_SECONDS is required',
    )
  }
  if (queueTtlSeconds > MAX_QUEUE_TTL_SECONDS) {
    throw new HarnessDispatchError(
      'INVALID_QUEUE_TTL_SECONDS',
      `HARNESS_QUEUE_TTL_SECONDS must be at most ${MAX_QUEUE_TTL_SECONDS}`,
    )
  }

  const created = await withSingleRetry(() =>
    client.createSession({
      concurrencyId,
      fallbacks,
      metadata: parseMetadata(environment.HARNESS_METADATA),
      priority,
      prompt,
      queueTtlSeconds,
      ...(environment.HARNESS_REF?.trim() ? { ref: environment.HARNESS_REF.trim() } : {}),
      repositoryId,
      requiredLabels: parseRequiredLabels(environment.HARNESS_REQUIRED_LABELS),
      source: 'webhook',
      target,
      timeout,
    }),
  )
  const result = { created: created.created, id: created.id, url: created.url }
  writeOutputs(environment, result, created.created ? [target, ...fallbacks] : undefined)
  return result
}

if (import.meta.main) {
  await dispatchHarnessSession(process.env)
}
