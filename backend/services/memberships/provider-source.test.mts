import { randomUUID } from 'node:crypto'
import {
  createTestSku,
  createTestUser,
  releaseMembershipSourceForRebindForTest,
  runTestMembershipProviderWrite,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getFamilyMembershipSourceProjectionAdmission } from './create/prepare-source.mts'
import { createMembership } from './create.mts'
import type { MembershipProviderSourceIdentity } from './create-types.mts'
import { createProviderMembershipSource } from './provider-source.mts'

describe('provider membership sources', () => {
  it('rejects a direct lineage bound to another account and rebinds its durable source after release', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const sourceIdentity = makeAppleSourceIdentity()
    const source = await createTestProviderSource({
      userId: firstUser.id,
      sourceKind: 'direct',
      sourceIdentity,
    })

    await expect(
      createTestProviderSource({
        userId: secondUser.id,
        sourceKind: 'direct',
        sourceIdentity,
      }),
    ).rejects.toThrow('Provider lineage is bound to another account')

    await releaseMembershipSourceForRebindForTest(source.id)

    const rebound = await createTestProviderSource({
      userId: secondUser.id,
      sourceKind: 'direct',
      sourceIdentity,
    })

    expect(rebound).toMatchObject({ kind: 'direct' })
    expect(rebound.id).toBe(source.id)
    expect(rebound.bindingId).not.toBe(source.bindingId)
  })

  it('keeps direct ownership and family recipients independently active on one lineage', async () => {
    const directUser = await createTestUser()
    const familyUser = await createTestUser()
    const sourceIdentity = makeAppleSourceIdentity()

    const direct = await createTestProviderSource({
      userId: directUser.id,
      sourceKind: 'direct',
      sourceIdentity,
    })
    const family = await createTestProviderSource({
      userId: familyUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })

    expect(direct).toMatchObject({ kind: 'direct', lineageId: family.lineageId })
    expect(family).toMatchObject({ kind: 'family' })
  })

  it('allows distinct family recipients and reuses the active family source for the same user', async () => {
    const [firstUser, secondUser] = await Promise.all([createTestUser(), createTestUser()])
    const sourceIdentity = makeAppleSourceIdentity()

    const first = await createTestProviderSource({
      userId: firstUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })
    const second = await createTestProviderSource({
      userId: secondUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })
    const duplicate = await createTestProviderSource({
      userId: firstUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })

    expect(first).toMatchObject({ kind: 'family', lineageId: second.lineageId })
    expect(duplicate).toMatchObject({ id: first.id, bindingId: first.bindingId })
  })

  it('creates fresh family source and binding after a recipient hard deletion', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const sourceIdentity = makeAppleSourceIdentity()
    const source = await createTestProviderSource({
      userId: firstUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })

    await releaseMembershipSourceForRebindForTest(source.id)

    const rebound = await createTestProviderSource({
      userId: secondUser.id,
      sourceKind: 'family',
      sourceIdentity,
    })

    expect(rebound.id).not.toBe(source.id)
    expect(rebound.bindingId).not.toBe(source.bindingId)
  })

  it('rejects conflicting provider account evidence for an established lineage', async () => {
    const user = await createTestUser()
    const sourceIdentity = makeAppleSourceIdentity({ providerAccountId: 'apple-account-one' })
    await createTestProviderSource({
      userId: user.id,
      sourceKind: 'direct',
      sourceIdentity,
    })

    await expect(
      createTestProviderSource({
        userId: user.id,
        sourceKind: 'direct',
        sourceIdentity: { ...sourceIdentity, providerAccountId: 'apple-account-two' },
      }),
    ).rejects.toThrow('Provider lineage account does not match the incoming evidence')
  })

  it('reserves originating invoices for direct Stripe sources', async () => {
    const user = await createTestUser()

    await expect(
      createTestProviderSource({
        userId: user.id,
        sourceKind: 'family',
        sourceIdentity: makeAppleSourceIdentity(),
        stripeOriginatingInvoiceId: `in_not_apple_${randomUUID()}`,
      }),
    ).rejects.toThrow('Only direct Stripe sources may bind an originating invoice')
  })

  it.each(['direct', 'admin_grant'] as const)(
    'retains a family source without displacing a same-plan %s projection',
    async currentSourceKind => {
      const user = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      if (currentSourceKind === 'direct') {
        await createMembership({
          userId: user.id,
          plan: 'plus',
          skuId: sku.id,
          stripeSubscriptionId: `sub_family_priority_${randomUUID()}`,
        })
      } else {
        await createMembership({
          userId: user.id,
          plan: 'plus',
          skuId: sku.id,
          durationDays: 30,
        })
      }
      const familySource = await createTestProviderSource({
        userId: user.id,
        sourceKind: 'family',
        sourceIdentity: makeAppleSourceIdentity(),
      })

      await expect(
        getTestFamilySourceProjectionAdmission({
          userId: user.id,
          membershipSourceId: familySource.id,
          plan: 'plus',
          effectiveAt: new Date(),
        }),
      ).resolves.toMatchObject({ accepted: false, currentSourceKind })
    },
  )

  it('allows a higher-tier family source to project over lower-tier direct access', async () => {
    const user = await createTestUser()
    const plusSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: plusSku.id,
      stripeSubscriptionId: `sub_family_higher_tier_${randomUUID()}`,
    })
    const familySource = await createTestProviderSource({
      userId: user.id,
      sourceKind: 'family',
      sourceIdentity: makeAppleSourceIdentity(),
    })

    await expect(
      getTestFamilySourceProjectionAdmission({
        userId: user.id,
        membershipSourceId: familySource.id,
        plan: 'pro',
        effectiveAt: new Date(),
      }),
    ).resolves.toEqual({ accepted: true })
  })
})

function makeAppleSourceIdentity(
  overrides: Partial<MembershipProviderSourceIdentity> = {},
): MembershipProviderSourceIdentity {
  return {
    provider: 'apple_app_store',
    environment: 'test',
    applicationId: `com.voucha.membership.test.${randomUUID()}`,
    providerLineageId: `original-transaction-${randomUUID()}`,
    ...overrides,
  }
}

function createTestProviderSource(options: Parameters<typeof createProviderMembershipSource>[0]) {
  return runTestMembershipProviderWrite(query => createProviderMembershipSource(options, query))
}

function getTestFamilySourceProjectionAdmission(
  options: Parameters<typeof getFamilyMembershipSourceProjectionAdmission>[0],
) {
  return runTestMembershipProviderWrite(query =>
    getFamilyMembershipSourceProjectionAdmission(options, query),
  )
}
