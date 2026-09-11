import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from '../create.mts'

describe('createMembership provider lineage authority', () => {
  it('rejects a current provider lineage bound to another account', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const lineage = `sub_binding_${randomUUID()}`

    await createMembership({
      userId: firstUser.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: lineage,
    })
    await expect(
      createMembership({
        userId: secondUser.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: lineage,
      }),
    ).rejects.toThrow('Provider lineage is bound to another account')
  })
})
