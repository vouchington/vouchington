import { write } from '@data-stores/psql'
import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeed from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import type { StructuredDecisionResult } from '@modules/structured-decisions'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { moderationConfig } from '../../../../services/moderation/config.mts'
import {
  claimClassifierRun,
  requestClassifierRuns,
  reserveClassifierRun,
} from '../../../../services/classifier-runs/index.mts'
import { createPostClassifierRunAdapter } from '../../../../services/post-classifier/index.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { createTestPost, createTestUser, insertTestCommunity } from '../../../index.mts'
import { setPostClassifierToggleForTest } from '../../../entities/post-classifier-toggles.mts'
import { setPostClassifierPostHashForTest } from './run-facts.mts'
import { acquirePostClassifierSeedTestLock } from './seed-lock.mts'

export const POST_CLASSIFIER_TEST_DETECTOR_VERSION = 'test-package-version'

export function createTestPostClassifierAdapter() {
  return createPostClassifierRunAdapter(POST_CLASSIFIER_TEST_DETECTOR_VERSION)
}

export async function initializePostClassifierExecutionTests() {
  const { release } = await acquirePostClassifierSeedTestLock()
  try {
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeed(), undefined)
    return release
  } catch (err) {
    await release()
    throw err
  }
}

/** Writes the durable request that approval writes in its transaction, and nothing else. */
export function requestPostClassifierRun(post: { id: string }, inputSha256: Buffer) {
  return requestClassifierRuns(write, {
    subject: { postId: post.id, rssFeedItemId: null },
    inputSha256,
    classifierSlugs: [POST_CLASSIFIER_SLUG],
  })
}

/** An approved community post whose moderation content hash is current, with no run or request yet. */
export async function createApprovedClassifierPost(remote = true, local = true) {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  if (remote) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  if (!local) await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
  const post = await createTestPost({ user, community_id: community.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  return { user, community, post, inputSha256 }
}

/** An approved post whose C5 run is reserved through the shared lifecycle and then claimed. */
export async function createPostClassifierExecutionFixture(remote = true, local = true) {
  const { community, post, inputSha256 } = await createApprovedClassifierPost(remote, local)
  const adapter = createTestPostClassifierAdapter()
  const subject = { postId: post.id, rssFeedItemId: null } as const
  const reserved = await reserveClassifierRun(adapter, subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  const claim = await claimClassifierRun(adapter, {
    runId: reserved.run.runId,
    subject,
    inputSha256,
    configurationSha256: reserved.run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
  return {
    post,
    adapter,
    run: reserved.run,
    lease: claim.lease,
    community,
    maxAttempts: 3,
    signal: AbortSignal.timeout(30_000),
  }
}

export type PostClassifierExecutionFixture = Awaited<
  ReturnType<typeof createPostClassifierExecutionFixture>
>

export function makePostClassifierResponse(ids: readonly string[]): StructuredDecisionResult {
  return {
    answers: ids.map(id => ({ id, type: 'noul', probability: 0.9, raw: { noul: 0.9 } })),
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    raw: {},
    usage: null,
  }
}
