import {
  extendCpuProviderCooldownMs,
  getCpuProviderCooldownRemainingMs,
} from '@services/bedrock-embeddings/provider-cooldown'
import { clampRateLimitDelayMs } from '@vouchington/queue-errors'
import { Worker, type Job } from 'glide-mq'

/** Defer Bedrock work by its shared provider lane without idling an unrelated worker. */
export async function runBedrockJobWithProviderCooldown<T>(
  job: Job,
  groupKey: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (groupKey) {
    const remainingMs = await getCpuProviderCooldownRemainingMs(groupKey)
    if (remainingMs) return job.moveToDelayed(Date.now() + remainingMs)
  }
  try {
    return await run()
  } catch (err) {
    if (!(err instanceof Worker.RateLimitError)) throw err
    const delayMs = clampRateLimitDelayMs((err as { delayMs?: number }).delayMs)
    const sharedDelayMs = groupKey ? await extendCpuProviderCooldownMs(groupKey, delayMs) : delayMs
    return job.moveToDelayed(Date.now() + sharedDelayMs)
  }
}
