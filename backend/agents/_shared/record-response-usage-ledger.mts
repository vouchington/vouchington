import { recordAiUsage } from '@services/ai-usage'
import onError from '@modules/on-error'
import { recordAndDeleteBackgroundResponseUsage } from '@services/openai-background-responses'
import type { ModelUsage } from '@vouchington/ai/providers'
import { getBackgroundResponseJobContext } from './background-response-job-context.mts'

export interface BackgroundResponseRegistration {
  responseId: string
  kind: 'job' | 'table'
  createdAt: Date
}

/** Which classifier run's provider attempt made a call, and how long the response took. */
export interface ClassifierUsageAttribution {
  runId: string
  latencyMs: number
}

interface ClaimRegisteredResponseUsageParams {
  responseId?: string
  /** `anthropic`, `openai` or `typesafe`; the `ai_model_providers` finite set guards the column. */
  provider: string
  transport: string
  usage: ModelUsage
  model: string
  serviceTier: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  registration?: BackgroundResponseRegistration
  classifier?: ClassifierUsageAttribution
  createdAt?: Date
}

/** A response id is the exact once billing fence across normal and recovery paths. */
export async function claimRegisteredResponseUsage({
  registration,
  responseId,
  createdAt,
  classifier,
  ...usage
}: ClaimRegisteredResponseUsageParams): Promise<void> {
  const options = {
    responseId: registration?.responseId ?? responseId,
    createdAt: registration?.createdAt ?? createdAt,
    classifierRunId: classifier?.runId,
    latencyMs: classifier?.latencyMs,
    ...usage,
  }
  if (registration?.kind === 'table') {
    await recordAndDeleteBackgroundResponseUsage({
      ...options,
      responseId: registration.responseId,
    })
    return
  }
  await recordAiUsage(options)
  if (registration?.kind === 'job') {
    const job = getBackgroundResponseJobContext()
    if (!job)
      throw new Error(
        `Background response lost its GlideMQ job context: ${registration.responseId}`,
      )
    // The ledger write above is the durable billing fence. If clearing job data fails, recovery
    // can use that key to settle the retained response id. Do not fail a successful model call:
    // that would replay the paid processor before it can mark its completed phase.
    try {
      await job.settle(registration.responseId)
    } catch (err) {
      onError(
        err instanceof Error
          ? err
          : new Error('Failed to settle billed response in job data', { cause: err }),
      )
    }
  }
}
