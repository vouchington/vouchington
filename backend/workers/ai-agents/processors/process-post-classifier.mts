import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import type { Job } from 'glide-mq'
import {
  createPostClassifierOpenRouterClient,
  executePostClassifierOutcomes,
} from '@agents/post-classifier'
import { enqueuePostClassifier } from '@queues/ai-agents/enqueues/post-classifier'
import type {
  PostClassifierDispatcherJobData,
  PostClassifierJobData,
} from '@queues/ai-agents/types'
import {
  claimPostClassifierApplication,
  completePostClassifierApplication,
  reservePostClassifierApplication,
  resolvePostClassifierConfiguration,
  supersedeStalePostClassifierApplication,
} from '@services/post-classifier'
import { getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import { detectAiGeneratedModeration } from './ai-generated-content.mts'
import { AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'

const LEASE_SECONDS = 60
const EXECUTION_DEADLINE_MS = 55_000
const detectorPackageVersion = detectorPackage.version

export async function processPostClassifierDispatcher(
  job: Job<PostClassifierDispatcherJobData>,
): Promise<{ kind: 'enqueued' | 'stale' }> {
  const reservation = await reservePostClassifierApplication(
    job.data.postId,
    detectorPackageVersion,
  )
  if (!reservation) return { kind: 'stale' }
  await enqueuePostClassifier({
    applicationId: reservation.applicationId,
    postId: reservation.postId,
    inputSha256: reservation.inputSha256.toString('hex'),
    configurationSha256: reservation.configurationSha256.toString('hex'),
    detectorPackageVersion: reservation.detectorPackageVersion,
  })
  return { kind: 'enqueued' }
}

export async function processPostClassifier(
  job: Job<PostClassifierJobData>,
): Promise<{ kind: 'completed' | 'replay' | 'stale' | 'terminal' | 'in_progress' }> {
  const inputSha256 = Buffer.from(job.data.inputSha256, 'hex')
  const configurationSha256 = Buffer.from(job.data.configurationSha256, 'hex')
  if (inputSha256.length !== 32 || configurationSha256.length !== 32) return { kind: 'stale' }
  if (job.data.detectorPackageVersion !== detectorPackageVersion) {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  const post = await getPostByAny(job.data.postId, { readOnly: false })
  if (!post || !post.approved_at || post.rejected_at || post.in_review_at) {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  const resolved = await resolvePostClassifierConfiguration(post.community_id, {
    detectorPackageVersion,
  })
  const { content_sha256: currentInputSha256 } = createPostModerationContent(post)
  if (
    !resolved ||
    !currentInputSha256.equals(inputSha256) ||
    !resolved.configurationSha256.equals(configurationSha256)
  ) {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  const claim = await claimPostClassifierApplication({
    applicationId: job.data.applicationId,
    postId: post.id,
    inputSha256,
    resolved,
    detectorPackageVersion,
    leaseSeconds: LEASE_SECONDS,
  })
  if (claim.kind === 'in_progress') {
    return job.moveToDelayed(Date.now() + claim.retryAfterSeconds * 1_000)
  }
  if (claim.kind === 'stale') {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  if (claim.kind === 'terminal') return { kind: 'terminal' }
  if (claim.kind === 'completed') {
    await enqueueReconcilePostNotifications(post.id)
    return { kind: 'replay' }
  }
  if (claim.kind !== 'claimed' && claim.kind !== 'outcomes_ready') return { kind: 'stale' }
  const signal = AbortSignal.timeout(EXECUTION_DEADLINE_MS)
  const outcome = await executePostClassifierOutcomes(
    { post, lease: claim, maxAttempts: AI_AGENTS_DEFAULTS.attempts, signal },
    {
      detectLocal: detectAiGeneratedModeration,
      createClient: hooks =>
        createPostClassifierOpenRouterClient({
          postId: post.id,
          communityId: post.community_id,
          beforeAttempt: hooks.beforeAttempt,
        }),
    },
  )
  if (outcome === 'stale') {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  if (outcome === 'terminal') return { kind: 'terminal' }
  const completion = await completePostClassifierApplication(claim)
  if (completion.kind === 'stale') {
    await supersedeAndDispatchCurrent(job.data, inputSha256, configurationSha256)
    return { kind: 'stale' }
  }
  await enqueueReconcilePostNotifications(post.id)
  return { kind: completion.kind }
}

async function supersedeAndDispatchCurrent(
  data: PostClassifierJobData,
  inputSha256: Buffer,
  configurationSha256: Buffer,
): Promise<void> {
  const replacement = await supersedeStalePostClassifierApplication({
    applicationId: data.applicationId,
    postId: data.postId,
    inputSha256,
    configurationSha256,
    detectorPackageVersion,
  })
  if (!replacement) return
  await enqueuePostClassifier({
    applicationId: replacement.applicationId,
    postId: replacement.postId,
    inputSha256: replacement.inputSha256.toString('hex'),
    configurationSha256: replacement.configurationSha256.toString('hex'),
    detectorPackageVersion: replacement.detectorPackageVersion,
  })
}
