import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export class InvalidMembershipGrantUserError extends Error {
  constructor() {
    super('The membership grant user does not exist')
    this.name = 'InvalidMembershipGrantUserError'
  }
}

export async function createGrantSource(
  options: {
    userId: string
    grantedById?: string | null
    durationDays?: number
    note?: string
  },
  productId: string,
  query: QueryExecutor,
) {
  const durationDays = options.durationDays
  if (
    !Number.isInteger(durationDays) ||
    durationDays === undefined ||
    durationDays < 1 ||
    durationDays > 3660
  )
    throw new RangeError('Admin grants require durationDays between 1 and 3660')
  const issuerSnapshot = await getGrantIssuerSnapshot(options.grantedById, query)
  const { rows } = await query(sql`/* createMembership: serialize and persist grant FIFO */
    WITH locked_user AS (
      SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE
    ), open_direct_term AS (
      SELECT 1
      FROM memberships membership
      INNER JOIN membership_sources source ON source.id = membership.membership_source_id
      CROSS JOIN locked_user
      WHERE membership.user_id = ${options.userId}
        AND source.source_kind = 'direct'
        AND membership.projection_ended_at IS NULL
        AND membership.cancelled_at IS NULL
        AND membership.expired_at IS NULL
        AND membership.paused_at IS NULL
      LIMIT 1
    ), open_grant AS (
      SELECT 1 FROM membership_grant_activation_periods
      WHERE user_id = ${options.userId} AND ended_at IS NULL LIMIT 1
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind)
      SELECT id, 'admin_grant' FROM locked_user RETURNING id
    ), grant_row AS (
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id, calendar_days,
        granted_by_id, issuer_snapshot, note
      )
      SELECT source.id, ${options.userId}, ${productId}, ${durationDays},
        ${options.grantedById ?? null}, ${issuerSnapshot}, ${options.note ?? null}
      FROM source
      RETURNING id, membership_source_id
    )
    SELECT id AS grant_id, membership_source_id,
      EXISTS (SELECT 1 FROM open_direct_term) OR EXISTS (SELECT 1 FROM open_grant) AS queued
    FROM grant_row`)
  const persisted = rows[0] as
    | { grant_id: string; membership_source_id: string; queued: boolean }
    | undefined
  if (!persisted) throw new InvalidMembershipGrantUserError()
  if (persisted.queued)
    return {
      id: persisted.membership_source_id,
      kind: 'admin_grant' as const,
      lineageId: null,
      grantId: persisted.grant_id,
      queued: true,
      expiresAt: null,
    }
  const { rows: activationRows } = await query(sql`/* createMembership: grant activation */
    INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
    VALUES (${persisted.grant_id}, ${options.userId}, CURRENT_TIMESTAMP)
    RETURNING started_at + make_interval(days => ${durationDays}) AS expires_at`)
  return {
    id: persisted.membership_source_id,
    kind: 'admin_grant' as const,
    lineageId: null,
    grantId: persisted.grant_id,
    queued: false,
    expiresAt: (activationRows[0] as { expires_at: Date }).expires_at,
  }
}
async function getGrantIssuerSnapshot(
  grantedById: string | null | undefined,
  query: QueryExecutor,
): Promise<string> {
  if (!grantedById) return 'system'
  const { rows } = await query(sql`/* createMembership: snapshot grant issuer */
    SELECT COALESCE(
      '@' || issuer.username,
      primary_email.email_address,
      issuer.id::text
    ) AS issuer_snapshot
    FROM users issuer
    LEFT JOIN LATERAL (
      SELECT email_address
      FROM user_email_addresses
      WHERE user_id = issuer.id AND is_primary = true
      LIMIT 1
    ) primary_email ON true
    WHERE issuer.id = ${grantedById}`)
  const issuer = rows[0] as { issuer_snapshot: string } | undefined
  if (!issuer) throw new Error('Membership grant issuer does not exist')
  return issuer.issuer_snapshot
}
