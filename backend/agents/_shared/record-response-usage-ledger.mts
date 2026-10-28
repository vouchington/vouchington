import { recordAiUsage } from '@services/ai-usage'
import onError from '@modules/on-error'
import type { ModelUsage } from '@vouchington/ai/providers'
import { getBackgroundResponseJobContext } from './background-response-job-context.mts'

export interface BackgroundResponseRegistration {
  responseId: string
  createdAt: Date
}

/** Which classifier run's provider attempt made a call, and how long the response took. */
export interface ClassifierUsageAttribution {
  runId: string
  latencyMs: number
}

interface ClaimRegisteredResponseUsageParams {
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
  /** Set only by classifier clients, which never register a background response. */
  classifier?: ClassifierUsageAttribution
  createdAt?: Date
}

/**
 * Writes the ai_usage_records row, then clears the response id its owning job saved. A failure to
 * clear it is reported rather than thrown: failing a successful model call would replay the paid
 * processor, and the next retry only re-checks a finished response.
 */
export async function claimRegisteredResponseUsage({
  registration,
  createdAt,
  classifier,
  ...usage
}: ClaimRegisteredResponseUsageParams): Promise<void> {
  await recordAiUsage({
    createdAt: registration?.createdAt ?? createdAt,
    classifierRunId: classifier?.runId,
    latencyMs: classifier?.latencyMs,
    ...usage,
  })
  if (!registration) return
  try {
    await getBackgroundResponseJobContext()?.settle(registration.responseId)
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Failed to settle billed response in job data', { cause: err }),
    )
  }
}
