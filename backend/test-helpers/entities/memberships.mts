import { beginTransaction } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import type { MembershipPlanSlug, MembershipStatus } from '@voucha/types/entities/membership'
import { recordTestMembershipChange, getLifecycleFields } from './memberships-lifecycle.mts'
import {
  createRetiredTestSkuRecord,
  createTestSkuRecord,
  type CreateTestSkuOptions,
} from './memberships-skus.mts'
export {
  attachTestStripeProductionProviderObservation,
  getTestMembershipProviderObservation,
} from './memberships/provider-observations.mts'
export { getTestMembershipProviderEvidenceId } from './memberships/provider-evidence.mts'
export { createTestUnprojectedStripeProductionProviderObservation } from './memberships/unprojected-provider-observations.mts'
export { createTestFamilyMembership } from './memberships/family.mts'
export { createTestLaunchedNativeMembershipPurchaseIntent } from './memberships/purchase-intents-native.mts'
export {
  createTestNativeMembershipProviderProduct,
  retireTestMembershipProviderProduct,
} from './memberships-skus.mts'
export {
  ageTestMembershipRenewalPriceIncreaseClaim,
  rejectTestMembershipProviderEvidence,
  setTestMembershipSourceStateUpdatedAt,
  updateTestMembershipCancelAtPeriodEnd,
  updateTestMembershipExpiresAt,
} from './memberships/updates.mts'
export {
  runTestActionAfterMembershipUserLock,
  setTestMembershipGrantRemainingMilliseconds,
} from './memberships-lifecycle.mts'
export {
  runConcurrentTestMembershipProductValidation,
  runConcurrentTestRetainedMembershipProductReconciliation,
  runTestActionWhileMembershipUserLocked,
  withTestMembershipUserLocked,
} from './memberships/locks.mts'
export {
  getTestGrantQueue,
  getTestMembershipGrant,
  getTestMembershipGrantActivations,
  getTestMembershipGrantRemainingMilliseconds,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from './memberships-read.mts'
const ACTIVE_PLANS_CACHE_PREFIX = 'membership_products:provider-v1:active_plans'

export async function createTestSku(options: CreateTestSkuOptions = {}) {
  const sku = await createTestSkuRecord(options)
  await ValkeyCache.invalidate(ACTIVE_PLANS_CACHE_PREFIX)
  return sku
}

export async function createRetiredTestSku(options: CreateTestSkuOptions = {}) {
  const sku = await createRetiredTestSkuRecord(options)
  await ValkeyCache.invalidate(ACTIVE_PLANS_CACHE_PREFIX)
  return sku
}

type CreateTestMembershipOptions = {
  user_id: string
  effective_at?: Date
  plan?: MembershipPlanSlug
  sku_id?: string
  status?: MembershipStatus
  stripe_subscription_id?: string | null
  stripe_customer_id?: string | null
  provider_environment?: 'test' | 'production'
  provider_application_id?: string
  binding_bound_at?: Date
  granted_by_id?: string | null
}
type TestMembershipRow = {
  id: string
  user_id: string
  membership_source_id: string
  plan: MembershipPlanSlug
  sku_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  granted_by_id: string | null
  created_at: Date
  updated_at: Date
}

export async function createTestMembership(options: CreateTestMembershipOptions) {
  let skuId = options.sku_id
  let createdSku: Awaited<ReturnType<typeof createTestSku>> | undefined
  if (!skuId) {
    createdSku = await createTestSku({ plan: options.plan ?? 'plus' })
    skuId = createdSku.id
  }
  const plan = options.plan ?? 'plus'
  const status = options.status ?? 'active'
  const stripeSubscriptionId =
    options.stripe_subscription_id !== undefined
      ? options.stripe_subscription_id
      : options.stripe_customer_id === null || options.stripe_customer_id === undefined
        ? null
        : `sub_test_fixture_${randomUUID()}`
  const providerEnvironment =
    options.provider_environment ?? createdSku?.provider_environment ?? 'test'
  const providerApplicationId =
    options.provider_application_id ?? createdSku?.provider_application_id ?? 'voucha-web'
  const effectiveAt = options.effective_at ?? new Date()
  const lifecycle = getLifecycleFields(status, effectiveAt)
  await using transaction = await beginTransaction()
  const query = transaction
  const { rows } = await query(sql`/* createTestMembership */
        WITH inserted_lineage AS (
          INSERT INTO membership_provider_lineages (
            provider, environment, application_id, provider_lineage_id, provider_account_id
          )
          SELECT 'stripe', ${providerEnvironment}, ${providerApplicationId}, ${stripeSubscriptionId}, ${options.stripe_customer_id ?? null}
          WHERE ${stripeSubscriptionId}::text IS NOT NULL
          ON CONFLICT (provider, environment, application_id, provider_lineage_id)
          DO NOTHING
          RETURNING id
        ), lineage AS (
          SELECT id FROM inserted_lineage
          UNION ALL
          SELECT id FROM membership_provider_lineages
          WHERE provider = 'stripe' AND environment = ${providerEnvironment}
            AND application_id = ${providerApplicationId}
            AND provider_lineage_id = ${stripeSubscriptionId}
            AND provider_account_id IS NOT DISTINCT FROM ${options.stripe_customer_id ?? null}
            AND NOT EXISTS (SELECT 1 FROM inserted_lineage)
        ), binding AS (
          INSERT INTO membership_lineage_bindings (
            membership_provider_lineage_id, user_id, bound_at
          )
          SELECT id, ${options.user_id}, ${options.binding_bound_at ?? new Date()} FROM lineage
          ON CONFLICT DO NOTHING
        ), source AS (
          INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
          SELECT
            ${options.user_id},
            CASE WHEN ${stripeSubscriptionId}::text IS NULL THEN 'admin_grant'::membership_source_kinds ELSE 'direct'::membership_source_kinds END,
            (SELECT id FROM lineage)
          RETURNING id
        ), state AS (
          INSERT INTO membership_source_states (
            membership_source_id, source_kind, membership_provider_lineage_id,
            membership_product_id, effective_at, cancelled_at, expired_at, past_due_at, paused_at
          )
          SELECT id,
            CASE WHEN ${stripeSubscriptionId}::text IS NULL THEN 'admin_grant'::membership_source_kinds ELSE 'direct'::membership_source_kinds END,
            (SELECT id FROM lineage), ${skuId}, ${effectiveAt},
            ${lifecycle.cancelledAt}, ${lifecycle.expiredAt}, ${lifecycle.pastDueAt}, ${lifecycle.pausedAt}
          FROM source
        ), grant_row AS (
          INSERT INTO membership_grants (
            membership_source_id, user_id, membership_product_id, calendar_days, granted_by_id, issuer_snapshot
          )
          SELECT id, ${options.user_id}, ${skuId}, 365, ${options.granted_by_id ?? null}, 'test fixture'
          FROM source
          WHERE ${stripeSubscriptionId}::text IS NULL
          RETURNING id
        ), activation AS (
          INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
          SELECT id, ${options.user_id}, ${effectiveAt} FROM grant_row
        )
        INSERT INTO memberships (
          user_id, membership_source_id, membership_product_id, effective_at,
          cancelled_at, expired_at, past_due_at, paused_at
        )
        SELECT
          ${options.user_id}, id, ${skuId}, ${effectiveAt},
          ${lifecycle.cancelledAt}, ${lifecycle.expiredAt}, ${lifecycle.pastDueAt}, ${lifecycle.pausedAt}
        FROM source
        ON CONFLICT (user_id) WHERE projection_ended_at IS NULL
        DO UPDATE SET
          membership_source_id = EXCLUDED.membership_source_id,
          membership_product_id = EXCLUDED.membership_product_id,
          effective_at = EXCLUDED.effective_at,
          cancelled_at = EXCLUDED.cancelled_at,
          expired_at = EXCLUDED.expired_at,
          past_due_at = EXCLUDED.past_due_at,
          paused_at = EXCLUDED.paused_at
        RETURNING id, user_id, membership_source_id, ${plan}::membership_plan_slugs AS plan, membership_product_id AS sku_id,
          ${stripeSubscriptionId}::text AS stripe_subscription_id, ${options.stripe_customer_id ?? null}::text AS stripe_customer_id,
          ${options.granted_by_id ?? null}::uuid AS granted_by_id, created_at, updated_at
      `)
  const membership = rows[0] as TestMembershipRow
  await recordTestMembershipChange({
    membershipId: membership.id,
    userId: options.user_id,
    toProductId: skuId,
    cancelledAt: lifecycle.cancelledAt,
    expiredAt: lifecycle.expiredAt,
    pastDueAt: lifecycle.pastDueAt,
    pausedAt: lifecycle.pausedAt,
    query,
  })
  await transaction.commit()
  return { ...membership, status }
}
