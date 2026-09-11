import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function holdTestUserSuspensionTransaction(
  userId: string,
  suspendedById: string,
): Promise<{ release: () => void; completed: Promise<void> }> {
  let markSuspended: () => void = () => undefined
  let releaseTransaction: () => void = () => undefined
  const suspended = new Promise<void>(resolve => {
    markSuspended = resolve
  })
  const released = new Promise<void>(resolve => {
    releaseTransaction = resolve
  })
  const completed = holdSuspensionTransaction()

  async function holdSuspensionTransaction(): Promise<void> {
    await using transaction = await beginTransaction()
    await transaction(sql`/* holdTestUserSuspensionTransaction:lock */
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)
    await transaction(sql`/* holdTestUserSuspensionTransaction:insert */
        INSERT INTO user_suspensions (user_id, suspended_by_id, reason)
        VALUES (${userId}, ${suspendedById}, 'concurrent Bluesky completion test')`)
    markSuspended()
    await released
    await transaction.commit()
  }
  await suspended
  return { release: releaseTransaction, completed }
}
