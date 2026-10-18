import { randomUUID } from 'node:crypto'
import { beginTransaction, read } from '@data-stores/psql'
import { createCommunityLifecycleNotifications } from '@services/notifications'
import { createCommunityPostReview } from '@services/communities/publications/add'
import { insertCommunity } from '@services/communities/create-insert'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  runApplicationQuestions,
  runInviteRedeem,
  runParticipantRead,
} from './community-write-round-trips.mts'
import { runAndCapture, seedUser, heavyFollowUser, seedPostId } from '../run-support.mts'

async function seededCommunityId(): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* explainCommunityRoundTripsCommunity */ SELECT id FROM communities WHERE slug = 'seed-community-0'`,
  )
  if (!rows[0]) throw new Error('The community round-trip scenarios need seed-community-0')
  return rows[0].id
}

// The post and the community with the caller's standing come back in one statement. The seeded
// post carries no community, so the call stops at the post-scope check after that read.
async function runPostReviewLoad(communityId: string): Promise<void> {
  registerScenarioContract('community-post-review-load', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['communities_pkey', 'idx_community_members__unique'] },
      // Both modes read one post, one community and one membership row; budgets add 20%.
      { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 2 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2 },
    ],
  })
  await runAndCapture(
    'community-post-review-load',
    async () => {
      await using transaction = await beginTransaction()
      await createCommunityPostReview(seedUser.id, seedPostId, communityId, {
        query: transaction,
      }).then(
        () => {
          throw new Error('The seeded post must not belong to the seeded community')
        },
        (err: unknown) => {
          if ((err as { status?: number }).status !== 422) throw err
        },
      )
      await transaction.rollback()
    },
    undefined,
    'createCommunityPostReview:load',
  )
}

// Two notifications in one insert, rolled back.
async function runLifecycleNotifications(communityId: string): Promise<void> {
  registerScenarioContract('community-lifecycle-notifications', {
    // Both modes insert two rows; budget adds 20%.
    expectations: [{ kind: 'maxProcessedRows', relation: 'notifications', max: 3 }],
  })
  await runAndCapture(
    'community-lifecycle-notifications',
    async () => {
      await using transaction = await beginTransaction()
      const created = await createCommunityLifecycleNotifications(
        [seedUser.id, heavyFollowUser.id].map(userId => ({
          userId,
          communityId,
          entityType: 'community_ownership_transfer' as const,
          eventKey: `explain-lifecycle:${randomUUID()}`,
          title: 'Ownership transferred',
          body: 'Ownership transferred.',
        })),
        { query: transaction },
      )
      if (created.length !== 2) throw new Error('Both lifecycle notifications must be inserted')
      await transaction.rollback()
    },
    undefined,
    'createCommunityLifecycleNotifications',
  )
}

// The community and its owner membership are inserted by one statement, rolled back.
async function runCommunityCreate(): Promise<void> {
  registerScenarioContract('community-create', {
    // Both modes insert one community and one owner membership; budgets add 20%.
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 2 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2 },
    ],
  })
  await runAndCapture(
    'community-create',
    async () => {
      await using transaction = await beginTransaction()
      const id = randomUUID()
      await insertCommunity(transaction, {
        id,
        slug: `explain-${id}`,
        defaultLanguage: null,
        currentUserId: seedUser.id,
        provenance: { createdVia: 'system', oauthClientId: null },
        input: { name: 'Explain community' },
      })
      await transaction.rollback()
    },
    undefined,
    'createCommunity',
  )
}

export async function runCommunityRoundTripScenarios(): Promise<void> {
  const communityId = await seededCommunityId()
  await runPostReviewLoad(communityId)
  await runLifecycleNotifications(communityId)
  await runCommunityCreate()
  await runParticipantRead()
  await runInviteRedeem(communityId)
  await runApplicationQuestions(communityId)
}
