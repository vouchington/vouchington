import {
  retainHardDeletedPostPublication,
  retainUserCascadeHardDeletedPosts,
} from '../../../services/post-publication/capture-hard-delete.mts'
import { retainHardDeletedPostPublicationKeys } from '../../../services/post-publication/capture-hard-delete-keys.mts'
import { retainPublicationIdentityBridges } from '../../../services/post-publication/identity-bridges.mts'
import { upsertPostPublicationDirtyWork } from '../../../services/post-publication/upsert-dirty-work.mts'
import { beginTransaction } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEED_PREFIX, runAndCapture, seedPostId } from '../run-support.mts'

const absentUserId = `${SEED_PREFIX}-0100-7000-8000-0000000000ee`

export async function runHardDeletedPostPublicationScenarios(): Promise<void> {
  await runAndCapture(
    'hard-deleted-post-publication-keys',
    () => captureHardDeletedPost(seedPostId),
    undefined,
    'listHardDeletedPostPublicationKeys',
  )
  await runAndCapture(
    'hard-deleted-post-publication-key-write',
    () => captureHardDeletedKeyWrite(seedPostId),
    undefined,
    'retainHardDeletedPostPublicationKeys',
  )
  await removeCommittedHardDeleteWork(seedPostId)
  await runAndCapture(
    'user-cascade-hard-deleted-post-ids',
    () => captureUserCascade(absentUserId),
    undefined,
    'listUserCascadeHardDeletedPostIds',
  )
}

async function captureHardDeletedPost(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await retainHardDeletedPostPublication(query, [postId])
}

/** EXPLAIN replays the key insert alone, so its parent identity and dirty-work rows must already be committed. */
async function captureHardDeletedKeyWrite(postId: string): Promise<void> {
  const dirtyWorkId = await committedHardDeleteWork(postId)
  await using query = await beginTransaction()
  await retainHardDeletedPostPublicationKeys(query, [
    { dirtyWorkId, key: { kind: 'impact_post', uuidValue: postId } },
  ])
}

export async function removeCommittedHardDeleteWork(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* removeExplainHardDeleteWork */ DELETE FROM post_publication_dirty_work_keys key
     USING post_publication_dirty_work work
     WHERE key.dirty_work_id = work.id AND work.post_identity_id = $1`,
    [postId],
  )
  await query(
    `/* removeExplainHardDeleteWork */ DELETE FROM post_publication_dirty_work WHERE post_identity_id = $1`,
    [postId],
  )
  await query(
    `/* removeExplainHardDeleteWork */ DELETE FROM post_publication_post_identities WHERE id = $1`,
    [postId],
  )
  await query.commit()
}

async function committedHardDeleteWork(postId: string): Promise<string> {
  await using query = await beginTransaction()
  await retainPublicationIdentityBridges(query, 'post', [postId])
  const [work] = await upsertPostPublicationDirtyWork(query, 'post', [postId], ['post_deleted'])
  if (!work) throw new Error('Expected committed hard-delete publication work')
  await query.commit()
  return work.id
}

async function captureUserCascade(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await retainUserCascadeHardDeletedPosts(query, userId)
}

registerScenarioContract('hard-deleted-post-publication-keys', {
  crossPartition: {
    posts: 'Hard-delete capture reads one doomed subtree across id partitions.',
  },
  expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 51 }],
})

registerScenarioContract('hard-deleted-post-publication-key-write', {
  allowEmptyResult: true,
  expectations: [
    { kind: 'maxProcessedRows', relation: 'post_publication_dirty_work_keys', max: 1 },
  ],
})

registerScenarioContract('user-cascade-hard-deleted-post-ids', {
  allowEmptyResult: true,
  crossPartition: {
    posts: 'User purge lists remaining authored posts by created_by_id across id partitions.',
  },
  expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 6 }],
})
