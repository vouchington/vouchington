import sql, { type SQLStatement } from 'sql-template-strings'

export function buildBlueskyAuthorizationExpiryPredicate(
  authorizationAlias: 'link_auth' | 'bluesky_link_authorizations',
  cutoffDate: Date,
  lowerBoundDate?: Date,
): SQLStatement {
  const authorizationExpiry =
    authorizationAlias === 'link_auth'
      ? sql`link_auth.expires_at`
      : sql`bluesky_link_authorizations.expires_at`
  const handoffReadyAuthorization =
    authorizationAlias === 'link_auth'
      ? sql`link_auth.status = 'handoff_ready' AND EXISTS (SELECT 1 FROM bluesky_link_completions completion WHERE completion.authorization_id = link_auth.id`
      : sql`bluesky_link_authorizations.status = 'handoff_ready' AND EXISTS (SELECT 1 FROM bluesky_link_completions completion WHERE completion.authorization_id = bluesky_link_authorizations.id`
  const predicate = sql``.append(authorizationExpiry).append(sql` < ${cutoffDate}`)
  if (lowerBoundDate !== undefined) {
    predicate
      .append(sql` AND `)
      .append(authorizationExpiry)
      .append(sql` >= ${lowerBoundDate}`)
  }
  predicate
    .append(sql` OR (`)
    .append(handoffReadyAuthorization)
    .append(sql` AND completion.expires_at < ${cutoffDate}`)
  if (lowerBoundDate !== undefined)
    predicate.append(sql` AND completion.expires_at >= ${lowerBoundDate}`)
  predicate.append(sql`))`)
  return predicate
}
