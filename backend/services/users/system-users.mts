import { write, read, beginTransaction } from '@data-stores/psql'
import type { BasicUser } from './types.mts'
import { isSlug } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getPrivateUserByAny } from './get.mts'
import {
  AUTOTAGGER_AGENT_SYSTEM_USERNAME,
  AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME,
  MODERATION_SYSTEM_USERNAME,
  RSS_FEED_AUTO_UPDATER_USERNAME,
  STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME,
} from './constants.mts'

type SystemUserRow = {
  id: string
  username: string
  use_display_name_from: NonNullable<BasicUser['use_display_name_from']> | null
}

type EmailUserRow = Omit<SystemUserRow, 'username'> & { username: string | null }

const systemUsers = new Map<string, SystemUserRow>()

/**
 * System users are used by the system to perform actions.
 * There is no login associated with them.
 */

/**
 * Reserved system usernames are looked up by literal username elsewhere (role grants, agent rows).
 * Any authenticated user can rename themselves via PATCH /api/v1/my/identity, so a reserved
 * username can be squatted before this runs. Reclaim it from any non-system holder (renaming them
 * out of the way using their own full UUIDv7, so no two reclaimed squatters can collide) before
 * upserting the explicitly classified platform identity, so ownership is structural rather than trusted
 * by username string alone.
 */
export const upsertSystemUser = async (
  username: string,
  kind: 'official' | 'system' = 'system',
): Promise<SystemUserRow> => {
  assert(isSlug(username), 422, 'Username must be a valid slug')
  await using query = await beginTransaction()
  await write(
    sql`/* upsertSystemUser */
        UPDATE users
        SET username = 'reclaimed-' || replace(id::text, '-', '')
        WHERE LOWER(username) = LOWER(${username}) AND platform_account_kind IS NULL
      `,
    { query },
  )
  const { rows } = await write<SystemUserRow>(
    sql`/* upsertSystemUser */
        INSERT INTO users (username, platform_account_kind, vote_weight_admin_set_at)
        VALUES (${username}, ${kind}, CURRENT_TIMESTAMP)
        ON CONFLICT ((LOWER(username))) WHERE username IS NOT NULL
        DO UPDATE SET username = EXCLUDED.username, platform_account_kind = ${kind},
          vote_weight_admin_set_at = COALESCE(users.vote_weight_admin_set_at, CURRENT_TIMESTAMP)
        WHERE users.platform_account_kind IS NOT NULL
        RETURNING id, username, use_display_name_from
      `,
    { query },
  )
  const result = rows[0]
  await query.commit()
  return result
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

export const getSystemUserByUsername = async (username: string): Promise<SystemUserRow | null> => {
  if (systemUsers.has(username)) return systemUsers.get(username)!
  const { rows } = await read<SystemUserRow>(sql`/* getSystemUserByUsername */
    SELECT id, username, use_display_name_from
    FROM users
    WHERE username = ${username} AND platform_account_kind = 'system'
    LIMIT 1
  `)
  const user = rows[0] || null
  if (user) {
    systemUsers.set(username, user)
  }
  return user
}

/** Load the actual persisted roles before using a system user as an authorization actor. */
export async function getSystemUserForAuthorization(username: string) {
  const systemUser = await getSystemUserByUsername(username)
  if (!systemUser) return null
  return getPrivateUserByAny(systemUser.id, { readOnly: false })
}

export const getUserByPrimaryEmail = async (email: string): Promise<EmailUserRow | null> => {
  const normalizedEmail = email.trim().toLowerCase()
  const { rows } = await read<EmailUserRow>(sql`/* getUserByPrimaryEmail */
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

// C6's shared actor for classifier-derived topic votes (backend/services/classifiers) -- a
// dedicated system user distinct from the reserved 'autotagger' account, which C7 acts as.
export async function getAutotaggerClassifierSystemUserId(): Promise<string> {
  const user = await getSystemUserByUsername(AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME)
  if (!user) throw new Error(`System user ${AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME} not found`)
  return user.id
}

/** The scoped reasoning autotagger's (C7) actor on its run receipts and the topic relations it adds. */
export async function getAutotaggerAgentSystemUserId(): Promise<string> {
  const user = await getSystemUserByUsername(AUTOTAGGER_AGENT_SYSTEM_USERNAME)
  if (!user) throw new Error(`System user ${AUTOTAGGER_AGENT_SYSTEM_USERNAME} not found`)
  return user.id
}

/** The shared actor recorded on the story-clustering classifier's run receipts. */
export async function getStoryClusteringClassifierSystemUserId(): Promise<string> {
  const user = await getSystemUserByUsername(STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME)
  if (!user) throw new Error(`System user ${STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME} not found`)
  return user.id
}
