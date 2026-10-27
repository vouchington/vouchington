import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Simulate a lifecycle transition between the verification guard and final update on real PG. */
export function beginTransactionWithLostVerificationStatus(
  userId: string,
): typeof beginTransaction {
  return async options => {
    const transaction = await beginTransaction(options)
    return new Proxy(transaction, {
      apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
        const [statement] = argumentsList
        if (
          typeof statement === 'string' ||
          !('text' in statement) ||
          !statement.text.includes('onVerificationSessionVerified:update')
        ) {
          return Reflect.apply(target, thisArgument, argumentsList) as ReturnType<
            typeof transaction
          >
        }
        return (async () => {
          await target(sql`/* beginTransactionWithLostVerificationStatus */
            UPDATE users SET verification_status = 'failed', pending_verification_session_id = NULL
            WHERE id = ${userId}
          `)
          return Reflect.apply(target, thisArgument, argumentsList) as ReturnType<
            typeof transaction
          >
        })()
      },
    })
  }
}
