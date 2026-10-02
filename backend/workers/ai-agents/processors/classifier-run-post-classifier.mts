import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import {
  createPostClassifierOpenRouterClient,
  executePostClassifierRun,
} from '@agents/post-classifier'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import {
  createPostClassifierRunAdapter,
  type PostClassifierConfiguration,
  type PostClassifierEffects,
  type PostClassifierLocalOutcome,
} from '@services/post-classifier'
import { getPostByAny } from '@services/posts/get'
import { detectAiGeneratedModeration } from './ai-generated-content.mts'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C5: the only worker code the post classifier owns. The shared classifier-run lifecycle claims,
 * caps, fails and completes the run; this loads the post and builds C5's input.
 */
export function createPostClassifierRegistration(
  detectorPackageVersion = detectorPackage.version,
): ClassifierRunRegistration<
  PostClassifierConfiguration,
  PostClassifierLocalOutcome,
  PostClassifierEffects
> {
  const adapter = createPostClassifierRunAdapter(detectorPackageVersion)
  return {
    adapter,
    async execute(lease, { maxAttempts, signal }) {
      const post = lease.subject.postId
        ? await getPostByAny(lease.subject.postId, { readOnly: false })
        : null
      if (!post) return 'stale'
      return executePostClassifierRun(
        { adapter, post, lease, maxAttempts, signal },
        {
          detectLocal: detectAiGeneratedModeration,
          createClient: hooks =>
            createPostClassifierOpenRouterClient({
              postId: post.id,
              communityId: post.community_id,
              classifierRunId: hooks.classifierRunId,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      )
    },
    async afterCompleted(subject) {
      if (subject.postId) await enqueueReconcilePostNotifications(subject.postId)
    },
  }
}
