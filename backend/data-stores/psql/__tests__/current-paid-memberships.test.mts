import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { read, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'

type PaidMembershipViewRow = {
  user_id: string
  plan: 'plus' | 'pro'
}

type PrivateUserMembershipRow = {
  id: string
  membership_plan: 'plus' | 'pro' | null
}

type MembershipViewStatusRow = {
  status: 'active' | 'expired' | 'past_due'
  user_id: string
}

type MembershipBillingIdentityRow = {
  expires_at: Date | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  user_id: string
}

describe('current paid membership views', () => {
  it('derives elapsed family and administrator-grant sources as expired', async () => {
    const [directUser, familyUser, grantUser] = await Promise.all([
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
    ])
    const [plusProduct, proProduct] = await getActiveProducts()
    const stalePeriodEnd = new Date(Date.now() - 60_000)
    await Promise.all([
      createProviderSource(directUser.id, plusProduct.id, stalePeriodEnd, 'direct', true),
      createProviderSource(familyUser.id, proProduct.id, stalePeriodEnd, 'family', true),
      createElapsedAdminGrant(grantUser.id, proProduct.id, stalePeriodEnd, true),
    ])

    const statuses = await getMembershipStatuses(directUser.id, familyUser.id, grantUser.id)
    expect(Object.fromEntries(statuses.map(({ user_id, status }) => [user_id, status]))).toEqual({
      [directUser.id]: 'past_due',
      [familyUser.id]: 'expired',
      [grantUser.id]: 'expired',
    })
    const billingIdentities = await getMembershipBillingIdentities(directUser.id, familyUser.id)
    expect(billingIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: directUser.id,
          stripe_customer_id: expect.any(String),
          stripe_subscription_id: expect.any(String),
        }),
        {
          user_id: familyUser.id,
          expires_at: stalePeriodEnd,
          stripe_customer_id: null,
          stripe_subscription_id: null,
        },
      ]),
    )
  })

  it('retains a stale direct source but excludes elapsed finite sources', async () => {
    const [directUser, familyUser, grantUser] = await Promise.all([
      createLocalTestUser(),
      createLocalTestUser(),
      createLocalTestUser(),
    ])
    const [plusProduct, proProduct] = await getActiveProducts()
    const stalePeriodEnd = new Date(Date.now() - 60_000)
    await Promise.all([
      createProviderSource(directUser.id, plusProduct.id, stalePeriodEnd, 'direct', true),
      createProviderSource(familyUser.id, proProduct.id, stalePeriodEnd, 'family', true),
      createElapsedAdminGrant(grantUser.id, proProduct.id, stalePeriodEnd, true),
    ])

    const currentPaid = await getCurrentPaidMemberships(directUser.id, familyUser.id, grantUser.id)
    expect(currentPaid).toEqual([{ user_id: directUser.id, plan: 'plus' }])

    const privateUsers = await getPrivateUserMemberships(directUser.id, familyUser.id, grantUser.id)
    expect(privateUsers).toHaveLength(3)
    expect(
      Object.fromEntries(privateUsers.map(({ id, membership_plan }) => [id, membership_plan])),
    ).toEqual({
      [directUser.id]: 'plus',
      [familyUser.id]: null,
      [grantUser.id]: null,
    })
  })
})

async function getActiveProducts(): Promise<Array<{ id: string }>> {
  const { rows } = await read<{ id: string }>(sql`/* getCurrentPaidMembershipViewProducts */
    SELECT id
    FROM membership_products
    WHERE billing_interval = 'monthly'
      AND retired_at IS NULL
      AND plan IN ('plus', 'pro')
    ORDER BY plan`)
  expect(rows).toHaveLength(2)
  return rows
}

async function createProviderSource(
  userId: string,
  productId: string,
  expiresAt: Date,
  sourceKind: 'direct' | 'family',
  pastDue = false,
): Promise<void> {
  const providerLineageId = `view-current-paid-${randomUUID()}`
  await write(sql`/* createStaleProviderMembershipSource */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id, provider_account_id
      ) VALUES (
        'stripe', 'test', 'view-current-paid-test', ${providerLineageId},
        ${`account-${randomUUID()}`}
      )
      RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, ${userId} FROM lineage
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${userId}, ${sourceKind}, id FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_provider_lineage_id,
        membership_product_id, effective_at, expires_at, past_due_at
      )
      SELECT id, ${sourceKind}, membership_provider_lineage_id, ${productId},
        ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt},
        CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END
      FROM source
    )
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at, past_due_at
    )
    SELECT ${userId}, id, ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt},
      CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END
    FROM source`)
}

async function createElapsedAdminGrant(
  userId: string,
  productId: string,
  expiresAt: Date,
  pastDue = false,
): Promise<void> {
  await write(sql`/* createElapsedAdminGrantForCurrentPaidMembershipView */
    WITH source AS (
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${userId}, 'admin_grant')
      RETURNING id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_product_id, effective_at, expires_at,
        past_due_at
      )
      SELECT id, 'admin_grant', ${productId},
        ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt},
        CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END
      FROM source
    ), grant_row AS (
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
      )
      SELECT id, ${userId}, ${productId}, 30, 'current paid membership view test'
      FROM source
      RETURNING id
    ), activation AS (
      INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
      SELECT id, ${userId}, ${expiresAt}::timestamptz - INTERVAL '30 days'
      FROM grant_row
    )
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at, past_due_at
    )
    SELECT ${userId}, id, ${productId}, ${expiresAt}::timestamptz - INTERVAL '30 days', ${expiresAt},
      CASE WHEN ${pastDue} THEN CURRENT_TIMESTAMP END
    FROM source`)
}

async function getCurrentPaidMemberships(
  directUserId: string,
  familyUserId: string,
  grantUserId: string,
): Promise<PaidMembershipViewRow[]> {
  const { rows } = await read<PaidMembershipViewRow>(sql`/* getStaleCurrentPaidMemberships */
    SELECT user_id, plan
    FROM view_current_paid_memberships
    WHERE user_id IN (${directUserId}, ${familyUserId}, ${grantUserId})
    ORDER BY user_id`)
  return rows
}

async function getMembershipStatuses(
  directUserId: string,
  familyUserId: string,
  grantUserId: string,
): Promise<MembershipViewStatusRow[]> {
  const { rows } = await read<MembershipViewStatusRow>(sql`/* getElapsedMembershipSourceStatuses */
    SELECT user_id, status
    FROM view_memberships
    WHERE user_id IN (${directUserId}, ${familyUserId}, ${grantUserId})`)
  return rows
}

async function getMembershipBillingIdentities(
  directUserId: string,
  familyUserId: string,
): Promise<MembershipBillingIdentityRow[]> {
  const { rows } = await read<MembershipBillingIdentityRow>(sql`/* getMembershipBillingIdentities */
    SELECT user_id, expires_at, stripe_subscription_id, stripe_customer_id
    FROM view_memberships
    WHERE user_id IN (${directUserId}, ${familyUserId})
    ORDER BY user_id`)
  return rows
}

async function getPrivateUserMemberships(
  directUserId: string,
  familyUserId: string,
  grantUserId: string,
): Promise<PrivateUserMembershipRow[]> {
  const { rows } = await read<PrivateUserMembershipRow>(sql`/* getStalePrivateUserMemberships */
    SELECT id, membership_plan
    FROM view_users_private
    WHERE id IN (${directUserId}, ${familyUserId}, ${grantUserId})
    ORDER BY membership_plan IS NULL, id`)
  return rows
}
