import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { VoteWeightFactors } from './calculate.mts'

type GatheredFactors = VoteWeightFactors & {
  current_weight: number
  vote_weight_admin_set_at: Date | null
}

type GatherFactorDependencies = {
  read: typeof read
  write: typeof write
}

export async function gatherVoteWeightFactors(
  userId: string,
  opts?: { readFromWriter?: boolean },
  dependencies?: Partial<GatherFactorDependencies>,
): Promise<GatheredFactors | null> {
  const reader = dependencies?.read ?? read
  const writer = dependencies?.write ?? write
  const query = opts?.readFromWriter ? writer : reader
  const { rows } = await query(sql`/* gatherVoteWeightFactors */
    WITH oauth_stats AS (
      SELECT
        COUNT(*) AS oauth_count,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 year') AS oauth_older_than_1_year,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '5 years') AS oauth_older_than_5_years
      FROM (
        SELECT 'facebook' AS provider, created_at FROM facebook_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'apple', created_at FROM apple_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'google', created_at FROM google_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'x', created_at FROM x_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'linkedin', created_at FROM linkedin_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'microsoft', created_at FROM microsoft_accounts WHERE user_id = ${userId}
        UNION ALL
        SELECT 'github', created_at FROM github_accounts WHERE user_id = ${userId}
      ) all_oauth
    )
    SELECT
      u.vote_weight AS current_weight,
      u.vote_weight_admin_set_at,
      COALESCE(uuid_extract_timestamp(u.id), CURRENT_TIMESTAMP) AS account_created_at,
      os.oauth_count::int AS oauth_count,
      os.oauth_older_than_1_year::int AS oauth_older_than_1_year,
      os.oauth_older_than_5_years::int AS oauth_older_than_5_years,
      (
        COALESCE(es.has_email, false)::int
        + COALESCE(ps.has_phone, false)::int
        + COALESCE(pk.has_passkey, false)::int
        + os.oauth_count::int
      ) AS distinct_auth_method_count,
      ms.plan AS membership_plan,
      COALESCE(as2.is_admin, false) AS is_admin,
      pp.penalty_product::double precision AS penalty_multiplier,
      (u.verification_status = 'verified') AS is_identity_verified
    FROM users u
    CROSS JOIN oauth_stats os
    CROSS JOIN LATERAL (
      SELECT COUNT(*) > 0 AS has_email FROM user_email_addresses WHERE user_id = u.id
    ) es
    CROSS JOIN LATERAL (
      SELECT COUNT(*) > 0 AS has_phone FROM user_phone_numbers WHERE user_id = u.id
    ) ps
    CROSS JOIN LATERAL (
      SELECT COUNT(*) > 0 AS has_passkey FROM user_passkeys WHERE user_id = u.id
    ) pk
    LEFT JOIN LATERAL (
      SELECT membership.plan
      FROM view_current_paid_memberships membership
      WHERE membership.user_id = u.id
    ) ms ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) > 0 AS is_admin
      FROM user_roles ur
      JOIN user_roles_types urt ON urt.id = ur.role_type_id
      WHERE ur.user_id = u.id AND urt.slug = 'administrator'
    ) as2 ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(EXP(SUM(LN(penalty_multiplier))), 1.0) AS penalty_product
      FROM vote_weight_penalties WHERE user_id = u.id AND revoked_at IS NULL
    ) pp
    WHERE u.id = ${userId}
      AND u.deleted_at IS NULL
  `)

  const row = rows[0]
  if (!row) return null

  return {
    current_weight: row.current_weight as number,
    vote_weight_admin_set_at: row.vote_weight_admin_set_at as Date | null,
    accountCreatedAt: row.account_created_at as Date,
    oauthCount: row.oauth_count as number,
    oauthOlderThan1Year: row.oauth_older_than_1_year as number,
    oauthOlderThan5Years: row.oauth_older_than_5_years as number,
    distinctAuthMethodCount: row.distinct_auth_method_count as number,
    membershipPlan: row.membership_plan as 'plus' | 'pro' | null,
    isAdmin: row.is_admin as boolean,
    penaltyMultiplier: row.penalty_multiplier as number,
    isIdentityVerified: row.is_identity_verified as boolean,
  }
}
