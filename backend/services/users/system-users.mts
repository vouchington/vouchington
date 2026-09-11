import { write, read, beginTransaction } from '@data-stores/psql'
import type { BasicUser } from './types.mts'
import { isSlug } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { addUserRole } from './roles-permissions.mts'
import { MODERATION_SYSTEM_USERNAME, RSS_FEED_AUTO_UPDATER_USERNAME } from './constants.mts'

const systemUsers = new Map<string, BasicUser>()

/**
 * System users are used by the system to perform actions.
 * There is no login associated with them.
 */

/**
 * Reserved system usernames are looked up by literal username elsewhere (role grants, agent rows).
 * Any authenticated user can rename themselves via PATCH /api/v1/my/identity, so a reserved
 * username can be squatted before this runs. Reclaim it from any non-system holder (renaming them
 * out of the way using their own full UUIDv7, so no two reclaimed squatters can collide) before
 * upserting the system row with is_system = TRUE, so ownership is structural rather than trusted
 * by username string alone.
 */
export const upsertSystemUser = async (username: string): Promise<BasicUser> => {
  assert(isSlug(username), 422, 'Username must be a valid slug')
  await using query = await beginTransaction()
  await write(
    sql`/* upsertSystemUser */
        UPDATE users
        SET username = 'reclaimed-' || replace(id::text, '-', '')
        WHERE LOWER(username) = LOWER(${username}) AND is_system = FALSE
      `,
    { query },
  )
  const { rows } = await write(
    sql`/* upsertSystemUser */
        INSERT INTO users (username, is_system, vote_weight_admin_set_at)
        VALUES (${username}, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT ((LOWER(username))) WHERE username IS NOT NULL
        DO UPDATE SET username = EXCLUDED.username, is_system = TRUE,
          vote_weight_admin_set_at = COALESCE(users.vote_weight_admin_set_at, CURRENT_TIMESTAMP)
        WHERE users.is_system = TRUE
        RETURNING id, username, use_display_name_from
      `,
    { query },
  )
  const result = rows[0]
  await query.commit()
  return result
}

export const upsertSystemAdministrator = async (username: string): Promise<BasicUser> => {
  const user = await upsertSystemUser(username)
  await addUserRole(user.id, 'administrator')
  return user
}

export const upsertAdminEmailAddresses = async (
  userId: string,
  emails: { email: string; isPrimary: boolean }[],
): Promise<void> => {
  if (emails.length === 0) return
  const primaryCount = emails.filter(e => e.isPrimary).length
  assert(primaryCount <= 1, 422, 'At most one email address can be marked as primary')
  await using query = await beginTransaction()
  // Clear existing primary flag first to avoid violating the unique partial index
  // on (user_id) WHERE is_primary = TRUE when primary email changes.
  await write(
    sql`/* upsertAdminEmailAddresses */
        UPDATE user_email_addresses SET is_primary = FALSE WHERE user_id = ${userId}
      `,
    { query },
  )
  // Batch-upsert all emails in one statement, then restore the correct primary flag.
  const insert = sql`/* upsertAdminEmailAddresses */
    INSERT INTO user_email_addresses (user_id, email_address, is_primary) VALUES `
  emails.forEach(({ email, isPrimary }, i) => {
    if (i > 0) insert.append(sql`, `)
    insert.append(sql`(${userId}, ${email}, ${isPrimary})`)
  })
  insert.append(
    sql` ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
  )
  await write(insert, { query })
  await query.commit()
}

export const getSystemUserByUsername = async (username: string): Promise<BasicUser | null> => {
  if (systemUsers.has(username)) return systemUsers.get(username)!
  const { rows } = await read(sql`/* getSystemUserByUsername */
    SELECT id, username, use_display_name_from
    FROM users
    WHERE username = ${username} AND is_system = TRUE
    LIMIT 1
  `)
  const user = rows[0] || null
  if (user) {
    systemUsers.set(username, user)
  }
  return user
}

export const getUserByPrimaryEmail = async (email: string): Promise<BasicUser | null> => {
  const normalizedEmail = email.trim().toLowerCase()
  const { rows } = await read(sql`/* getUserByPrimaryEmail */
    SELECT u.id, u.username, u.use_display_name_from
    FROM user_email_addresses uea
    JOIN users u ON u.id = uea.user_id
    WHERE uea.email_address = ${normalizedEmail} AND uea.is_primary = TRUE AND u.deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getRssFeedAutoUpdaterUserId(): Promise<string> {
  const user = await getSystemUserByUsername(RSS_FEED_AUTO_UPDATER_USERNAME)
  if (!user) throw new Error(`System user ${RSS_FEED_AUTO_UPDATER_USERNAME} not found`)
  return user.id
}

export async function getModerationSystemUserId(): Promise<string> {
  const user = await getSystemUserByUsername(MODERATION_SYSTEM_USERNAME)
  if (!user) throw new Error(`System user ${MODERATION_SYSTEM_USERNAME} not found`)
  return user.id
}
