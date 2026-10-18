import { describe, expect, it } from 'vitest'
import { createTestUser, safeUsername, softDeleteUser } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getUserIdByAnyCached } from '@services/entity-cache/lookups'
import { getPrivateUserByAny } from '../get.mts'
import { updateUser } from '../update.mts'

describe('username update invalidation with a stale authenticated actor', () => {
  it('rejects the earlier username after another rename commits', async () => {
    const authenticatedUser = await createTestUser()
    if (!authenticatedUser.username) throw new Error('Expected username')
    const currentUsername = safeUsername('renamed')
    await updateUser(authenticatedUser, authenticatedUser.id, { username: currentUsername })

    await expect(
      updateUser(authenticatedUser, authenticatedUser.username, { ui_locale: 'fr' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getPrivateUserByAny(authenticatedUser.id)).toMatchObject({
      username: currentUsername,
      ui_locale: authenticatedUser.ui_locale,
    })
  })

  it('rejects a target deleted after authentication before the update command', async () => {
    const authenticatedUser = await createTestUser()
    await softDeleteUser(authenticatedUser.id)
    await expect(
      updateUser(authenticatedUser, authenticatedUser.id, { ui_locale: 'fr' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('invalidates the actual previous username after another rename commits', async () => {
    const authenticatedUser = await createTestUser()
    const intermediateUsername = safeUsername('intermediate')
    const finalUsername = safeUsername('final')

    await updateUser(authenticatedUser, authenticatedUser.id, { username: intermediateUsername })
    // A request authenticated with the original username can outlive this committed rename.
    await caches.users_lookup.set(intermediateUsername, authenticatedUser.id)
    expect(await getUserIdByAnyCached(intermediateUsername)).toBe(authenticatedUser.id)

    await updateUser(authenticatedUser, authenticatedUser.id, { username: finalUsername })

    expect(await getUserIdByAnyCached(intermediateUsername)).toBeNull()
    expect(await getUserIdByAnyCached(finalUsername)).toBe(authenticatedUser.id)
    expect(await getPrivateUserByAny(authenticatedUser.id)).toMatchObject({
      username: finalUsername,
    })
  })
})
