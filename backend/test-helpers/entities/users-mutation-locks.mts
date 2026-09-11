import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function lockTestUserMutation(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* lockTestUserMutation */ SELECT fn_lock_active_user_for_mutation(${userId})`)
}
