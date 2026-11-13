import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'

type Row = Record<string, unknown>
export async function readMembershipPurgeState(userId: string) {
  const { rows } = await read<{
    account: Row | null
    identity: Row
    sources: Row[]
    states: Row[]
    grants: Row[]
    activations: Row[]
    memberships: Row[]
    changes: Row[]
    bindings: Row[]
    operations: Row[]
    emails: Row[]
  }>(sql`/* readMembershipPurgeState */ SELECT
    (SELECT to_jsonb(account) FROM users account WHERE id = ${userId}) AS account,
    (SELECT to_jsonb(identity) FROM retained_user_identities identity WHERE id = ${userId}) AS identity,
    (SELECT COALESCE(jsonb_agg(to_jsonb(source) ORDER BY id), '[]'::jsonb)
      FROM membership_sources source WHERE user_id = ${userId}) AS sources,
    (SELECT COALESCE(jsonb_agg(to_jsonb(state) ORDER BY membership_source_id), '[]'::jsonb)
      FROM membership_source_states state WHERE membership_source_id IN
        (SELECT id FROM membership_sources WHERE user_id = ${userId})) AS states,
    (SELECT COALESCE(jsonb_agg(to_jsonb(grant_row) ORDER BY id), '[]'::jsonb)
      FROM membership_grants grant_row WHERE user_id = ${userId}) AS grants,
    (SELECT COALESCE(jsonb_agg(to_jsonb(activation) ORDER BY id), '[]'::jsonb)
      FROM membership_grant_activation_periods activation WHERE user_id = ${userId}) AS activations,
    (SELECT COALESCE(jsonb_agg(to_jsonb(membership) ORDER BY id), '[]'::jsonb)
      FROM memberships membership WHERE user_id = ${userId}) AS memberships,
    (SELECT COALESCE(jsonb_agg(to_jsonb(change) ORDER BY id), '[]'::jsonb)
      FROM membership_changes change WHERE user_id = ${userId}) AS changes,
    (SELECT COALESCE(jsonb_agg(to_jsonb(binding) ORDER BY id), '[]'::jsonb)
      FROM membership_lineage_bindings binding WHERE user_id = ${userId}) AS bindings,
    (SELECT COALESCE(jsonb_agg(to_jsonb(operation) ORDER BY id), '[]'::jsonb)
      FROM membership_operations operation WHERE membership_source_id IN
        (SELECT id FROM membership_sources WHERE user_id = ${userId})) AS operations,
    (SELECT COALESCE(jsonb_agg(to_jsonb(email) ORDER BY id), '[]'::jsonb)
      FROM user_email_addresses email WHERE user_id = ${userId}) AS emails`)
  if (!rows[0]) throw new Error('Owned membership purge state is missing')
  return rows[0]
}

export function completedMembershipPurgeState(
  before: Awaited<ReturnType<typeof readMembershipPurgeState>>,
  after: Awaited<ReturnType<typeof readMembershipPurgeState>>,
) {
  const terminalAt = after.grants[0]?.revoked_at
  if (typeof terminalAt !== 'string' || !Number.isFinite(Date.parse(terminalAt)))
    throw new Error('A committed purge must retain its native terminal timestamp')
  const terminal = (sourceId: unknown) => {
    if (!after.grants.some(row => row.membership_source_id === sourceId))
      throw new Error('A committed purge must retain every owned grant source')
    return terminalAt
  }
  return {
    ...before,
    account: null,
    identity: { ...before.identity, purged_at: expect.any(String) },
    grants: before.grants.map(row => ({
      ...row,
      revoked_at: terminal(row.membership_source_id),
      revoked_by_id: DELETED_USER_ID,
      revocation_reason: 'account_hard_deleted',
    })),
    states: before.states.map(row => ({
      ...row,
      cancelled_at:
        Date.parse(String(row.effective_at)) > Date.parse(terminalAt)
          ? row.effective_at
          : terminal(row.membership_source_id),
      expired_at: null,
      past_due_at: null,
      paused_at: null,
      should_auto_renew: false,
      updated_at: expect.any(String),
    })),
    activations: before.activations.map(row => {
      const grant = before.grants.find(candidate => candidate.id === row.membership_grant_id)
      if (!grant) throw new Error('Owned activation lost its grant')
      const at = terminal(grant.membership_source_id)
      return {
        ...row,
        ended_at: Date.parse(String(row.started_at)) > Date.parse(at) ? row.started_at : at,
      }
    }),
    memberships: [],
    emails: [],
  }
}

/** Count native SSI failures only on checkouts that actually read the owned purge account. */
export async function observeOwnedMembershipPurgePair(
  userId: string,
  operation: () => Promise<
    import('../services/data-retention/user-purge-types.mts').UserPurgeResult[]
  >,
) {
  const owned = new Set<object>()
  const aborted = new Set<object>()
  const { result } = await observeTestPostgresClientQueries(
    operation,
    async query => {
      if (query.connection && query.values.includes(userId)) owned.add(query.connection)
    },
    (query, err) => {
      if (
        query.connection &&
        (owned.has(query.connection) || query.values.includes(userId)) &&
        (err as { code?: string } | null)?.code === '40001'
      )
        aborted.add(query.connection)
    },
  )
  return { result, aborts: aborted.size }
}
