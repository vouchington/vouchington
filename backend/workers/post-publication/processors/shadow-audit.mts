import { enqueueContinuePostPublicationShadowAudit } from '@queues/post-publication/enqueues'
import type { PostPublicationShadowAuditJobData } from '@queues/post-publication/types'
import { runPostPublicationShadowAudit } from '@services/post-publication'

type ShadowAuditProcessorDependencies = {
  runPostPublicationShadowAudit: typeof runPostPublicationShadowAudit
  enqueueContinuePostPublicationShadowAudit: typeof enqueueContinuePostPublicationShadowAudit
}

const defaultDependencies: ShadowAuditProcessorDependencies = {
  runPostPublicationShadowAudit,
  enqueueContinuePostPublicationShadowAudit,
}

export async function processShadowAuditPostPublication(
  { dryRun, cursor }: PostPublicationShadowAuditJobData,
  dependencies: Partial<ShadowAuditProcessorDependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies }
  const result = await deps.runPostPublicationShadowAudit({ dryRun, cursor })
  if (result.hasMore) {
    if (!result.checkpoint) throw new TypeError('Shadow audit continuation requires a checkpoint')
    await deps.enqueueContinuePostPublicationShadowAudit(dryRun, result.checkpoint)
  }
  return result
}
