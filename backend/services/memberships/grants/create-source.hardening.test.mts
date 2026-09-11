import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestSku,
  createTestUser,
  createTestUserDirect,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'

describe('grant issuer snapshots', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('snapshots a human issuer by username, then primary email, then exact ID', async () => {
    const sku = await createTestSku({ plan: 'plus' })
    const emailIssuer = await createTestUser({ noUsername: true })
    const idIssuer = await createTestUserDirect({ noUsername: true })
    const [usernameGrant, emailGrant, idGrant] = await Promise.all([
      grantMembership(admin.id, (await createTestUser()).id, 'plus', sku.id, 30),
      grantMembership(emailIssuer.id, (await createTestUser()).id, 'plus', sku.id, 30),
      grantMembership(idIssuer.id, (await createTestUser()).id, 'plus', sku.id, 30),
    ])

    await expect(getTestMembershipRaw(usernameGrant.id)).resolves.toMatchObject({
      issuer_snapshot: `@${admin.username}`,
    })
    await expect(getTestMembershipRaw(emailGrant.id)).resolves.toMatchObject({
      issuer_snapshot: emailIssuer.email_address,
    })
    await expect(getTestMembershipRaw(idGrant.id)).resolves.toMatchObject({
      issuer_snapshot: idIssuer.id,
    })
  })

  it('uses system only for a grant without an issuer', async () => {
    const sku = await createTestSku({ plan: 'plus' })
    const recipient = await createTestUser()

    const grant = await createMembership({
      userId: recipient.id,
      plan: 'plus',
      skuId: sku.id,
      durationDays: 30,
    })

    await expect(getTestMembershipRaw(grant.id)).resolves.toMatchObject({
      issuer_snapshot: 'system',
    })
  })

  it('records the human issuer on the membership and change history', async () => {
    const target = await createTestUser()
    const sku = await createTestSku({ plan: 'pro' })
    const result = await grantMembership(admin.id, target.id, 'pro', sku.id, 30, {
      note: 'Test grant',
    })

    await expect(getMembershipByUserId(target.id)).resolves.toMatchObject({
      id: result.id,
      plan: 'pro',
      granted_by_id: admin.id,
    })
    await expect(getTestMembershipRaw(result.id)).resolves.toMatchObject({
      issuer_snapshot: `@${admin.username}`,
    })
    await expect(getMembershipHistory(target.id)).resolves.toEqual([
      expect.objectContaining({
        change_type: 'admin_grant',
        changed_by_id: admin.id,
      }),
    ])
  })
})
