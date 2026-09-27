/**
 * Reserved system usernames (e.g. 'jong', 'autotagger', 'system') are upserted by these
 * generators on every deploy, and role grants elsewhere key off that same username. Any
 * authenticated user can rename themselves via PATCH /api/v1/my/identity, so an attacker can
 * squat a reserved username before a deploy runs and land the privileged role meant for the
 * system account.
 *
 * buildSystemUserUpsertSQL closes that gap structurally: it first reclaims the username from any
 * non-system holder (renaming them out of the way using their own full UUIDv7 so no two reclaimed
 * squatters can collide), then updates the system row or inserts it if absent. The absent-only
 * INSERT avoids invoking the retained-identity BEFORE INSERT trigger on every replay. Downstream role
 * grants must additionally filter `is_system = TRUE` so a reclaimed squatter's stale row can never
 * satisfy a grant lookup.
 *
 * `username` is always a compile-time constant (an internal system slug, never user input), so
 * plain string interpolation into the SQL literal is safe here — mirrors the established pattern
 * in moderator-prompt-sync-sql.mts.
 */
export function buildSystemUserUpsertSQL(username: string): string {
  return `
-- Reclaim reserved username from any non-system squatter
UPDATE users
SET username = 'reclaimed-' || replace(id::text, '-', '')
WHERE LOWER(username) = LOWER('${username}') AND is_system = FALSE;

UPDATE users
SET username = '${username}',
  vote_weight_admin_set_at = COALESCE(users.vote_weight_admin_set_at, CURRENT_TIMESTAMP)
WHERE LOWER(username) = LOWER('${username}') AND is_system = TRUE;

INSERT INTO users (username, is_system, vote_weight_admin_set_at)
SELECT '${username}', TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('${username}'))
ON CONFLICT ((LOWER(username))) WHERE username IS NOT NULL DO NOTHING;`
}
