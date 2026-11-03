import { beginTransaction } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/**
 * Holds `FOR UPDATE` on one user row in an open transaction, as a concurrent writer of that user
 * would. `release` commits it; disposing without releasing rolls it back.
 */
export async function holdTestUserRowLock(userId: string) {
  const holder = await beginTransaction()
  try {
    await holder('/* holdTestUserRowLock */ SELECT id FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ])
    const processId = await getTestPostgresBackendProcessId(holder)
    let released = false
    return {
      processId,
      release: async () => {
        if (released) return
        released = true
        await holder.commit()
      },
      [Symbol.asyncDispose]: async () => {
        released = true
        await holder[Symbol.asyncDispose]()
      },
    }
  } catch (err) {
    await holder[Symbol.asyncDispose]()
    throw err
  }
}
