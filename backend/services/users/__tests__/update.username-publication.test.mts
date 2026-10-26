import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, safeUsername } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { caches } from '@services/entity-cache/caches'
import { getUserIdByAnyCached } from '@services/entity-cache/lookups'
import { processApplyPostPublicationEffects } from '../../../workers/post-publication/processors/direct-effects.mts'
import { updateUserFields } from '../update-fields.mts'

describe('username publication', () => {
  it('captures the old username and invalidates both old and live author keys', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    const oldUsername = user.username
    const newUsername = safeUsername('renamed')
    await createTestPost({ user })
    const request = createRequest()
    await request.authenticateAs(user)
    const jobs = await captureAddedPublicationEffectsForScope(user.id, () =>
      request.patch('/api/v1/my/identity').send({ username: newUsername }).expect(200),
    )
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'author_username_changed',
          keys: expect.arrayContaining([
            { kind: 'identity_author_username', textValue: oldUsername },
          ]),
        }),
      ]),
    )

    await Promise.all([
      caches.users_lookup.set(oldUsername, user.id),
      caches.users_lookup.set(newUsername, user.id),
    ])
    expect(await getUserIdByAnyCached(oldUsername)).toBe(user.id)
    for (const job of jobs) {
      await processApplyPostPublicationEffects(job)
    }
    expect(await getUserIdByAnyCached(oldUsername)).toBeNull()
    expect(await caches.users_lookup.get(newUsername)).toBeNull()
  })

  it('admits no author publication job when the username is unchanged', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    const username = user.username
    const request = createRequest()
    await request.authenticateAs(user)
    const jobs = await captureAddedPublicationEffectsForScope(user.id, async () => {
      await request.patch('/api/v1/my/identity').send({ username }).expect(200)
      await updateUserFields(user.id, { username }, user)
    })
    expect(jobs).toEqual([])
  })
})
