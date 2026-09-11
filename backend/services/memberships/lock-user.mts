import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { InvalidMembershipGrantUserError } from './create-source.mts'

export async function lockMembershipUser(
  userId: string,
  query: QueryExecutor,
  mapMissingToInvalidGrant = false,
): Promise<void> {
  try {
    await query(
      sql`/* lockMembershipUser:active */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )
  } catch (error) {
    if (mapMissingToInvalidGrant && isInvalidGrantTargetPostgresError(error)) {
      throw new InvalidMembershipGrantUserError()
    }
    throw error
  }
  await query(
    sql`/* lockMembershipUser:row */ SELECT id FROM users WHERE id = ${userId} FOR UPDATE`,
  )
}

function isInvalidGrantTargetPostgresError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return error.code === 'P0002' || error.code === '23514'
}
