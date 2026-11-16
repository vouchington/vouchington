import { beginTransaction } from '@data-stores/psql'
import { readCopyrightActionPreparation } from '../services/copyright-notices/action-delivery-preparation-facts.mts'

/** Own a real preparation resource and capture its claimed facts before a concurrent release. */
export async function openTestCopyrightPreparationTransaction(
  intentId: string,
  leaseToken: string,
) {
  const query = await beginTransaction()
  try {
    const legal = await readCopyrightActionPreparation(intentId, leaseToken, query)
    if (!legal) throw new Error('Restore facts missing')
    return {
      query,
      legal,
      [Symbol.asyncDispose]: () => query[Symbol.asyncDispose](),
    }
  } catch (err) {
    await query[Symbol.asyncDispose]()
    throw err
  }
}
