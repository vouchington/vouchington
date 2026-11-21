import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userProductLimitsConfig } from '@services/user-product-limits'
import { createMyMessageConversation } from './my-message-writes.mts'

describe('configured message recipients cap', () => {
  it('rejects a conversation naming more recipients than the cap and accepts exactly the cap', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userProductLimitsConfig, { message_recipients_max: 2 }),
    )
    const sender = await createTestUser()
    const [first, second] = await Promise.all([createTestUser(), createTestUser()])
    const create = (userIds: string[]) =>
      createMyMessageConversation(
        sender,
        async () => ({ user_ids: userIds }),
        () => undefined,
      )

    await expect(create([first.id, second.id, crypto.randomUUID()])).rejects.toMatchObject({
      status: 422,
    })
    await expect(create([first.id, second.id])).resolves.toMatchObject({
      conversation: expect.anything(),
    })
  })
})
