import { describe, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import assert from 'node:assert'
import { getPrivateUserByAny } from '../get.mts'
import { updateUserFields } from '../update-fields.mts'

describe('updateUserFields Hacker News discussions opt-in', () => {
  it('defaults to false for a newly created user', async () => {
    const testUser = await createTestUser()
    assert.strictEqual(testUser.should_import_hacker_news_discussions, false)
  })

  it('opts a user in to related Hacker News discussions', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { should_import_hacker_news_discussions: true })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.should_import_hacker_news_discussions, true)
  })

  it('opts a user back out of related Hacker News discussions', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { should_import_hacker_news_discussions: true })
    await updateUserFields(testUser.id, { should_import_hacker_news_discussions: false })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.should_import_hacker_news_discussions, false)
  })

  it('rejects a non-boolean value', async () => {
    const testUser = await createTestUser()
    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          should_import_hacker_news_discussions: 'yes' as unknown as Parameters<
            typeof updateUserFields
          >[1]['should_import_hacker_news_discussions'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })
})
