import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import type { PrivateUser } from '@voucha/types/entities/user'
import { beginTransaction, createTestSku, createTestUser } from '@voucha/test-helpers'
import { createTestAdministratorRefundRequest } from '@voucha/test-helpers/membership-administrator-refund-request'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getOutstandingMembershipGrantIds } from './grants/outstanding.mts'
import { grantMembership } from './create.mts'
import { getActiveMembershipCatalogFromPrimary } from './provider-catalog.mts'
import {
  claimAdministratorRefundRequest,
  leaseDueRefundReconciliation,
  recordRefundReconciliationAttempt,
} from './refund-reconciliation/index.mts'
import { publishStripeCatalogMapping } from './stripe-catalog-mappings.mts'
import { membershipWorkConfig } from './work-limits.mts'

describe('configured membership caps', () => {
  afterEach(() => vi.unstubAllEnvs())

  describe('outstanding grants per user', () => {
    let admin: PrivateUser
    beforeAll(async () => {
      admin = await createTestUser({ administrator: true })
    })

    it('rejects the grant past the configured cap and still reads every outstanding grant', async () => {
      const recipient = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const restore = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        outstanding_grants_per_user: 2,
      })
      try {
        await grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)
        await grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)
        await expect(
          grantMembership(admin.id, recipient.id, 'plus', sku.id, 30),
        ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_GRANT_LIMIT_REACHED' })
        overrideDynamicConfigFieldsForTest(membershipWorkConfig, { outstanding_grants_per_user: 3 })
        await grantMembership(admin.id, recipient.id, 'plus', sku.id, 30)
        overrideDynamicConfigFieldsForTest(membershipWorkConfig, { outstanding_grants_per_user: 1 })
        await using query = await beginTransaction()
        await expect(getOutstandingMembershipGrantIds(recipient.id, query)).resolves.toHaveLength(3)
      } finally {
        restore()
      }
    })
  })

  describe('active provider mappings', () => {
    it('rejects publishing past the configured mapping cap', async () => {
      const context = { environment: 'test' as const, applicationId: `cap-cfg-${randomUUID()}` }
      const restore = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        active_provider_mappings: 2,
      })
      try {
        const seeds = await Promise.all(
          [0, 1].map(() =>
            createTestSku({
              plan: 'plus',
              provider_environment: context.environment,
              provider_application_id: context.applicationId,
              sku_id: `cap-cfg-${randomUUID()}`,
            }),
          ),
        )
        await expect(
          publish({
            membershipProductId: seeds[0]!.id,
            providerProductId: `price-cap-cfg-${randomUUID()}`,
            skuId: `cap-cfg-${randomUUID()}`,
            amount: 500,
            context,
          }),
        ).rejects.toMatchObject({
          statusCode: 409,
          code: 'MEMBERSHIP_CATALOG_MAPPING_LIMIT_REACHED',
        })
      } finally {
        restore()
      }
    })

    it('reads every active catalog mapping when the cap is lowered', async () => {
      vi.stubEnv('ENVIRONMENT', 'staging')
      vi.stubEnv('NODE_ENV', 'test')
      // One more mapping than the lowered cap's row budget (4 * 4 providers * 1) would allow.
      await Promise.all(
        Array.from({ length: 17 }, () =>
          createTestSku({
            provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
            provider_application_id: 'voucha-web',
            stripe_price_id: `price_cap_cfg_${randomUUID()}`,
          }),
        ),
      )
      const restore = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        active_provider_mappings: 1,
      })
      try {
        const catalog = await getActiveMembershipCatalogFromPrimary()
        const mapped = catalog.flatMap(product => product.providers)
        expect(mapped.length).toBeGreaterThan(16)
      } finally {
        restore()
      }
    })
  })

  describe('local Stripe refund issuances per charge', () => {
    it('rejects admission past the configured cap for new claims and new attempts', async () => {
      const request = await createTestAdministratorRefundRequest()
      const restore = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
        local_stripe_refund_issuances_per_charge: 2,
      })
      try {
        const leases = []
        for (let index = 0; index < 3; index++) {
          const operation = await claimAdministratorRefundRequest({
            ...request,
            idempotencyKey: `cap-cfg-${randomUUID()}`,
          })
          const lease = await leaseDueRefundReconciliation(operation.id)
          if (!lease) throw new Error('Expected a pending refund operation')
          leases.push(lease)
        }
        for (const lease of leases.slice(0, 2))
          await recordRefundReconciliationAttempt(lease, `cap-cfg-attempt-${randomUUID()}`)
        await expect(
          recordRefundReconciliationAttempt(leases[2]!, `cap-cfg-attempt-${randomUUID()}`),
        ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_REFUND_LIMIT_REACHED' })
        await expect(
          claimAdministratorRefundRequest({
            ...request,
            idempotencyKey: `cap-cfg-${randomUUID()}`,
          }),
        ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_REFUND_LIMIT_REACHED' })
      } finally {
        restore()
      }
    })
  })
})

async function publish(options: Omit<Parameters<typeof publishStripeCatalogMapping>[0], 'query'>) {
  await using transaction = await beginTransaction()
  await publishStripeCatalogMapping({ ...options, query: transaction })
  await transaction.commit()
}
