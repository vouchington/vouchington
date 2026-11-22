import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { describe, expect, it } from 'vitest'
import { getMembershipByUserId } from './get.mts'
import { projectVerifiedProviderMembershipObservation } from './provider-observation-projection.mts'

describe('provider observation projection concurrency', () => {
  it.each(['apple_app_store', 'google_play'] as const)(
    'applies a %s expiration that arrives while a previous renewal is still committing',
    async provider => {
      const user = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const applicationId = `com.voucha.provider-ordering.${randomUUID()}`
      const providerProduct = await createTestNativeMembershipProviderProduct({
        membershipProductId: sku.id,
        provider,
        environment: 'test',
        applicationId,
        providerProductId: `ordering-product-${randomUUID()}`,
      })
      const day = 86_400_000
      const now = Date.now()
      const terminalAt = new Date(now - day)
      const source = {
        userId: user.id,
        applicationId,
        provider,
        membershipProductId: sku.id,
        membershipProviderProductId: providerProduct.id,
        providerLineageId: `ordering-lineage-${randomUUID()}`,
        sourceKind: 'direct' as const,
        effectiveAt: new Date(now - 3 * day),
      }
      const initial = await createTestUnprojectedProviderObservation({
        ...source,
        providerOrder: 1,
      })
      const { membershipId } = await projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: initial.membershipProviderObservationId,
      })
      if (!membershipId) throw new Error('Initial provider observation did not grant membership')
      const expiry = await createTestUnprojectedProviderObservation({
        ...source,
        status: 'expired',
        terminalAt,
        providerOrder: 3,
      })

      await using renewal = await beginTransaction()
      const older = await createTestUnprojectedProviderObservation(
        {
          ...source,
          effectiveAt: new Date(now - 2 * day),
          providerOrder: 2,
        },
        renewal,
      )
      await projectVerifiedProviderMembershipObservation(
        {
          userId: user.id,
          membershipProviderObservationId: older.membershipProviderObservationId,
        },
        { query: renewal },
      )
      const holderProcessId = await getTestPostgresBackendProcessId(renewal)
      let committed: Promise<void> | undefined
      const commitRenewal = () => (committed ??= renewal.commit())
      const [outcome] = await Promise.allSettled([
        withTestOwnedPostgresWait(
          {
            holderProcessId,
            pool: 'write',
            lock: { kind: 'transaction' },
            queryMarker: 'createMembership: lock provider source',
            releaseHolder: commitRenewal,
          },
          async waitForLock => {
            const pending = projectVerifiedProviderMembershipObservation({
              userId: user.id,
              membershipProviderObservationId: expiry.membershipProviderObservationId,
            })
            await waitForLock(pending)
            await commitRenewal()
            return pending
          },
        ),
      ])

      await expect(getTestMembershipSourceState(membershipId)).resolves.toMatchObject({
        membership_provider_observation_id: expiry.membershipProviderObservationId,
        expired_at: terminalAt,
      })
      await expect(getTestMembershipRaw(membershipId)).resolves.toMatchObject({ status: 'expired' })
      await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
      if (outcome.status === 'rejected') throw outcome.reason
      expect(outcome.value).toMatchObject({ membershipId, projected: true })
    },
  )
})
