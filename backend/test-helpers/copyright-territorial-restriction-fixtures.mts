import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import {
  recordCopyrightJurisdictionPolicyApproval,
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
} from '../services/copyright-notices/index.mts'

type Jurisdiction = 'eu_dsa' | 'uk'

export async function createTestTerritorialRestrictionScene(
  jurisdiction: Jurisdiction,
  targetCount = 1,
) {
  const posts = await Promise.all(
    Array.from({ length: targetCount }, () => createHostedImagePost('public')),
  )
  const [staff, administrator] = await Promise.all([
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const claimant = posts[0]?.claimant
  if (!claimant) throw new Error('A target post is required')
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction,
    policyVersion: `${jurisdiction.slice(0, 2)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
  const receive = jurisdiction === 'eu_dsa' ? receiveEuCopyrightNotice : receiveUkCopyrightNotice
  const suffix = crypto.randomUUID()
  const receipt = await receive(claimant, crypto.randomUUID(), {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Photograph ${suffix}`,
    grounds: `The hosted image reproduces my work ${suffix}`,
    hostedUseUrl: `https://voucha.ai/discussion/${posts[0]?.postId}`,
  })
  return {
    staff,
    claimant,
    claimantContact: `claimant-${suffix}@example.test`,
    noticeId: receipt.notice_id,
    posts,
    targets: posts.map(post => ({
      surfaceKind: 'post-image' as const,
      postId: post.postId,
      imageId: post.imageId,
      hostedUseUrl: `https://voucha.ai/discussion/${post.postId}`,
    })),
  }
}

export async function readTestTerritorialDecisions(noticeId: string) {
  const { rows } = await read<{
    id: string
    outcome: 'restrict' | 'no_action'
    copyright_notice_submission_assessment_id: string | null
  }>(sql`/* readTestTerritorialDecisions */
    SELECT id, outcome, copyright_notice_submission_assessment_id
    FROM copyright_territorial_decisions
    WHERE copyright_notice_id = ${noticeId} ORDER BY id`)
  return rows
}
