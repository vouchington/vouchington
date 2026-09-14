import { beginTransaction } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import sql from 'sql-template-strings'

export async function runTestStripeCatalogReconciliationWhileProductReferenced<T>(
  reconcile: () => Promise<T>,
): Promise<T> {
  const referenced = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const hold = holdReferencingInsert(referenced, release)
  void hold.catch(referenced.reject)

  await referenced.promise
  try {
    const outcome = await Promise.race([
      reconcile().then(result => ({ blocked: false as const, result })),
      delay(5_000).then(() => ({ blocked: true as const })),
    ])
    if (outcome.blocked)
      throw new Error(
        'Stripe catalog reconciliation was blocked by a foreign-key reference to a canonical membership product',
      )
    return outcome.result
  } finally {
    release.resolve()
    await hold
  }
}

async function holdReferencingInsert(
  referenced: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* runTestStripeCatalogReconciliationWhileProductReferenced: insert */
    INSERT INTO membership_provider_products (membership_product_id, provider, environment, application_id, provider_product_id)
    SELECT id, 'stripe', 'test', ${`stripe-catalog-fk-hold-${randomUUID()}`}, ${`price_fk_hold_${randomUUID()}`}
    FROM membership_products
    WHERE retired_at IS NULL ORDER BY plan, billing_interval LIMIT 1`)
  referenced.resolve()
  await release.promise
}
