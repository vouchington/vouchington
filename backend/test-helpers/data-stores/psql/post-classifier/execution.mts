import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeed from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import type { StructuredDecisionResult } from '@modules/structured-decisions'
import { moderationConfig } from '../../../../services/moderation/config.mts'
import { claimPostClassifierApplication } from '../../../../services/post-classifier/application-claim.mts'
import { resolvePostClassifierConfiguration } from '../../../../services/post-classifier/configuration.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { createTestPost, createTestUser, insertTestCommunity } from '../../../index.mts'
import { setPostClassifierToggleForTest } from '../../../entities/post-classifier-toggles.mts'
import { setPostClassifierPostHashForTest } from './application-service.mts'
import { acquirePostClassifierSeedTestLock } from './seed-lock.mts'

export async function initializePostClassifierExecutionTests() {
  const { release } = await acquirePostClassifierSeedTestLock()
  try {
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeed(), undefined)
    return release
  } catch (error) {
    await release()
    throw error
  }
}

export async function createPostClassifierExecutionFixture(remote = true, local = true) {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  if (remote) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  if (!local) await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
  const post = await createTestPost({ user, community_id: community.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  const detectorPackageVersion = 'test-package-version'
  const resolved = await resolvePostClassifierConfiguration(community.id, {
    detectorPackageVersion,
  })
  if (!resolved) throw new Error('Missing post classifier test configuration')
  const lease = await claimPostClassifierApplication({
    postId: post.id,
    inputSha256,
    resolved,
    detectorPackageVersion,
    leaseSeconds: 60,
  })
  if (lease.kind !== 'claimed') throw new Error(`Unexpected claim: ${lease.kind}`)
  return { post, lease, community, maxAttempts: 3, signal: AbortSignal.timeout(30_000) }
}

export function makePostClassifierResponse(ids: readonly string[]): StructuredDecisionResult {
  return {
    answers: ids.map(id => ({ id, type: 'noul', probability: 0.9, raw: { noul: 0.9 } })),
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    raw: {},
    usage: null,
  }
}
