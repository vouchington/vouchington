import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { expect } from 'vitest'
import { getTestMembershipGrant } from './entities/memberships-read.mts'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'
import { terminateRetainedMembershipGrants } from '../services/data-retention/terminate-retained-membership-grants.mts'

/** Canonical retained-only account facts; actual terminalization runs before this fixture commits. */
export async function createRetainedPurgeGrantFixture(
  administratorId: string,
  activeProductId: string,
  queuedProductId: string,
) {
  const userId = v7()
  await using query = await beginTransaction()
  await query(sql`/* createRetainedPurgeGrantFixture:identity */
    INSERT INTO retained_user_identities (id, purged_at) VALUES (${userId}, clock_timestamp())`)
  const { rows: sources } = await query<{
    id: string
  }>(sql`/* createRetainedPurgeGrantFixture:sources */
    INSERT INTO membership_sources (user_id, source_kind)
    VALUES (${userId}, 'admin_grant'), (${userId}, 'admin_grant') RETURNING id`)
  const [activeSource, queuedSource] = sources
  if (!activeSource || !queuedSource) throw new Error('Expected two retained grant sources')
  await query(sql`/* createRetainedPurgeGrantFixture:states */
    INSERT INTO membership_source_states (membership_source_id, source_kind, membership_product_id, effective_at)
    VALUES (${activeSource.id}, 'admin_grant', ${activeProductId}, CURRENT_TIMESTAMP),
      (${queuedSource.id}, 'admin_grant', ${queuedProductId}, CURRENT_TIMESTAMP)`)
  const { rows: grants } = await query<{
    id: string
    membership_source_id: string
  }>(sql`/* createRetainedPurgeGrantFixture:grants */
    INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, granted_by_id, issuer_snapshot)
    VALUES (${activeSource.id}, ${userId}, ${activeProductId}, 30, ${administratorId}, 'Owned retention administrator'),
      (${queuedSource.id}, ${userId}, ${queuedProductId}, 30, ${administratorId}, 'Owned retention administrator')
    RETURNING id, membership_source_id`)
  const active = grants.find(row => row.membership_source_id === activeSource.id)
  const queued = grants.find(row => row.membership_source_id === queuedSource.id)
  if (!active || !queued) throw new Error('Expected active and queued retained grants')
  await query(sql`/* createRetainedPurgeGrantFixture:activation */
    INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
    VALUES (${active.id}, ${userId}, CURRENT_TIMESTAMP)`)
  const processed = await terminateRetainedMembershipGrants(query, userId)
  if (processed !== 2)
    throw new Error('The real retained-grant producer must terminalize both grants')
  await query.commit()
  return { userId, activeId: active.id, queuedId: queued.id }
}

/** The original active/queued terminalization contract is exercised unconditionally. */
export async function assertRetainedPurgeGrantTerminalization(activeId: string, queuedId: string) {
  const activeGrant = await getTestMembershipGrant(activeId)
  const queuedGrant = await getTestMembershipGrant(queuedId)
  expect(activeGrant).toMatchObject({
    revoked_by_id: DELETED_USER_ID,
    revocation_reason: 'account_hard_deleted',
    revoked_at: expect.any(Date),
    source_cancelled_at: expect.any(Date),
    activation_started_at: expect.any(Date),
    activation_ended_at: expect.any(Date),
  })
  expect(activeGrant!.activation_ended_at!.getTime()).toBeGreaterThanOrEqual(
    activeGrant!.activation_started_at!.getTime(),
  )
  expect(queuedGrant).toMatchObject({
    revoked_by_id: DELETED_USER_ID,
    revocation_reason: 'account_hard_deleted',
    revoked_at: expect.any(Date),
    source_cancelled_at: expect.any(Date),
    activation_started_at: null,
    activation_ended_at: null,
  })
}
