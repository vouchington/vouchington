import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestSku,
  createTestUser,
  createTestUserDirect,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { revokeMembershipGrant } from './revoke.mts'
import { MAX_OUTSTANDING_MEMBERSHIP_GRANTS_PER_USER } from './outstanding.mts'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'

describe('grant issuer snapshots', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('rejects the eleventh outstanding grant and admits another after revocation', async () => {
    const recipient = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const elapsed = await createMembership({
      userId: recipient.id,
      plan: 'plus',
      skuId: sku.id,
      durationDays: 1,
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
    })
    await updateTestMembershipExpiresAt(elapsed.id, new Date('2020-01-02T00:00:00.000Z'))
    const grants: string[] = []
    for (let index = 0; index < MAX_OUTSTANDING_MEMBERSHIP_GRANTS_PER_USER; index++) {
      const grant = await grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)
      grants.push(grant.grantId)
    }
    await expect(getTestMembershipRaw(elapsed.id)).resolves.toMatchObject({
      expired_at: expect.any(Date),
    })
    await expect(grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)).rejects.toMatchObject(
      {
        statusCode: 409,
        code: 'MEMBERSHIP_GRANT_LIMIT_REACHED',
      },
    )
    await revokeMembershipGrant(admin.id, grants.at(-1)!, 'Replace queued grant')
    await expect(
      grantMembership(admin.id, recipient.id, 'plus', sku.id, 30),
    ).resolves.toMatchObject({
      queued: true,
    })
  })

  it('returns a conflict instead of over-admitting concurrent grants', async () => {
    const recipient = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    for (let index = 0; index < MAX_OUTSTANDING_MEMBERSHIP_GRANTS_PER_USER - 1; index++)
      await grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)
    const results = await Promise.allSettled([
      grantMembership(admin.id, recipient.id, 'plus', sku.id, 30),
      grantMembership(admin.id, recipient.id, 'plus', sku.id, 30),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } })
  })

  it('snapshots a human issuer by username, then primary email, then exact ID', async () => {
    const sku = await createTestSku({ plan: 'plus' })
    const emailIssuer = await createTestUser({ noUsername: true })
    const idIssuer = await createTestUserDirect({ noUsername: true })
    const [usernameRecipient, emailRecipient, idRecipient] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const usernameGrant = await grantMembership(admin.id, usernameRecipient.id, 'plus', sku.id, 30)
    const emailGrant = await grantMembership(emailIssuer.id, emailRecipient.id, 'plus', sku.id, 30)
    const idGrant = await grantMembership(idIssuer.id, idRecipient.id, 'plus', sku.id, 30)

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
    await expect(getMembershipHistory(target.id).then(page => page.results)).resolves.toEqual([
      expect.objectContaining({
        change_type: 'admin_grant',
        changed_by_id: admin.id,
      }),
    ])
  })
})
