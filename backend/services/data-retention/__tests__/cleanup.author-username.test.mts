import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestRetentionWindow,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import {
  readTestPublicationReceipt,
  readTestPublicationRetainedKeys,
  readTestPublicationSnapshot,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { reconcileTestPublicationUntilSnapshotsComplete } from '@voucha/test-helpers/post-publication-fixtures'
import {
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  recordPostPublicationChange,
} from '@services/post-publication'
import { deleteUser } from '@services/users/delete'
import { caches } from '../../entity-cache/caches.mts'
import { processReconcilePostPublication } from '../../../workers/post-publication/processors.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('deleted author publication cleanup', () => {
  it('purges the published username during deletion and needs no username at final purge', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    const post = await createTestPost({ user })
    await using publicationQuery = await beginTransaction()
    const publication = await recordPostPublicationChange(publicationQuery, {
      scope: { type: 'author', authorUserId: user.id },
      reason: 'post_updated',
    })
    await publicationQuery.commit()
    const publishedWork = await claimPostPublicationDirtyWork(publication, 60)
    if (!publishedWork) throw new Error('Expected publication lease')
    const published = await reconcileTestPublicationUntilSnapshotsComplete(publishedWork)
    expect(await acknowledgePostPublicationProjectionReceipts(publishedWork, published.posts)).toBe(
      true,
    )
    expect(
      (await readTestPublicationSnapshot((await readTestPublicationReceipt(post.id))!.snapshotId))
        .keys,
    ).toContainEqual({ kind: 'author_username', value: user.username })
    expect(
      await acknowledgePostPublicationDirtyWork({
        ...publishedWork,
        leaseToken: publishedWork.lease_token,
      }),
    ).toBe(true)

    await drainUserDeletionForTest(await deleteUser(user, user))
    const deletionWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'author',
      id: user.id,
    })
    if (!deletionWork) throw new Error('Expected scrubbed author work')
    expect(await readTestPublicationRetainedKeys(deletionWork.id)).toContainEqual({
      kind: 'identity_author_username',
      value: user.username,
    })
    await caches.users_lookup.set(user.username, user.id)
    expect(await caches.users_lookup.get(user.username)).toBe(user.id)
    await processReconcilePostPublication(
      {},
      {
        listAvailablePostPublicationDirtyWork: () => Promise.resolve([deletionWork]),
        enqueueContinuePostPublicationReconciliation: () => Promise.resolve(),
      },
    )
    expect(await caches.users_lookup.get(user.username)).toBeNull()
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: user.id }),
    ).toBeUndefined()

    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await expect(cleanupSoftDeletedUser(user.id, window.upperBoundDate)).resolves.toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await getTestUserRaw(user.id)).toBeNull()
    const purgeWork = await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: user.id })
    if (!purgeWork) throw new Error('Expected final author work')
    expect(await readTestPublicationRetainedKeys(purgeWork.id)).not.toContainEqual({
      kind: 'identity_author_username',
      value: user.username,
    })
    const purgeLease = await claimPostPublicationDirtyWork(purgeWork, 60)
    if (!purgeLease) throw new Error('Expected final publication lease')
    await expect(reconcileTestPublicationUntilSnapshotsComplete(purgeLease)).resolves.toBeDefined()
  })
})
