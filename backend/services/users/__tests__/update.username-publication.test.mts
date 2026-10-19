import { describe, expect, it, vi } from 'vitest'
import {
  createTestPost,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  safeUsername,
} from '@voucha/test-helpers'
import { claimPostPublicationDirtyWork } from '@services/post-publication'
import { reconcileTestPublicationUntilSnapshotsComplete } from '@voucha/test-helpers/post-publication-fixtures'
import * as cachePurgeEnqueues from '@queues/cache-purge/enqueues'
import { caches } from '@services/entity-cache/caches'
import { invalidateUserStrict } from '@services/entity-cache/invalidate-strict'
import { getUserIdByAnyCached } from '@services/entity-cache/lookups'
import { updateUserFields } from '../update-fields.mts'

describe('username publication', () => {
  it('rebuilds both author usernames and purges the old author page key', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    const oldUsername = user.username
    const newUsername = safeUsername('renamed')
    await createTestPost({ user })
    await updateUserFields(user.id, { username: newUsername }, user)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: user.id })
    if (!work) throw new Error('Expected author publication work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected author publication lease')
    const reconciled = await reconcileTestPublicationUntilSnapshotsComplete(claimed)

    expect(reconciled.identityKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'author', value: oldUsername }),
        expect.objectContaining({ kind: 'author', value: newUsername }),
      ]),
    )

    await caches.users_lookup.set(oldUsername, user.id)
    expect(await getUserIdByAnyCached(oldUsername)).toBe(user.id)
    const purge = vi.spyOn(cachePurgeEnqueues, 'enqueueBulkPurgeCacheTags')
    const authorValues = reconciled.identityKeys.flatMap(key =>
      key.kind === 'author' ? [key.value] : [],
    )
    await invalidateUserStrict(...authorValues)
    expect(purge.mock.calls.flatMap(call => call[0])).toEqual(
      expect.arrayContaining([`user:${oldUsername}`]),
    )
    expect(await getUserIdByAnyCached(oldUsername)).toBeNull()
    purge.mockRestore()
  })

  it('records no author publication work when the username is unchanged', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    await updateUserFields(user.id, { username: user.username }, user)
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: user.id }),
    ).toBeUndefined()
  })
})
