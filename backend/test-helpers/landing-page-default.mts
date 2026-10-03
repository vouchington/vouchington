import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Inserts the promotion target first so the unique-index regression has a checked heap order. */
export async function insertTestLandingPagesInPromotionOrder(userId: string) {
  await using query = await beginTransaction()
  const { rows: targets } = await query<{ id: string }>(sql`
    INSERT INTO user_landing_pages (user_id, title, slug, is_default)
    VALUES (${userId}, 'Earlier target', 'earlier-target', FALSE) RETURNING id
  `)
  const targetId = targets[0]!.id
  const { rows: defaults } = await query<{ id: string }>(sql`
    INSERT INTO user_landing_pages (user_id, title, slug, is_default)
    VALUES (${userId}, 'Later default', 'later-default', TRUE) RETURNING id
  `)
  const defaultId = defaults[0]!.id
  const { rows } = await query<{ target_precedes_default: boolean }>(sql`
    SELECT target.ctid < current_default.ctid AS target_precedes_default
    FROM user_landing_pages target, user_landing_pages current_default
    WHERE target.id = ${targetId} AND current_default.id = ${defaultId}
  `)
  await query.commit()
  return { targetId, defaultId, targetPrecedesDefault: rows[0]!.target_precedes_default }
}

/** Holds exactly the existing creation lock; callers release it before awaiting the blocked mutation. */
export async function holdTestLandingPageUserLock(userId: string) {
  const query = await beginTransaction()
  try {
    await query(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)
    const processId = await getTestPostgresBackendProcessId(query)
    return {
      processId,
      async release() {
        await query.commit()
      },
      async [Symbol.asyncDispose]() {
        await query[Symbol.asyncDispose]()
      },
    }
  } catch (err) {
    await query[Symbol.asyncDispose]()
    throw err
  }
}
