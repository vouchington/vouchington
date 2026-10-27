import { beginTransaction } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import sql from 'sql-template-strings'

export async function runTestStripeCatalogReconciliationWhileProductReferenced<T>(
  reconcile: () => Promise<T>,
): Promise<T> {
  const referenced = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const hold = holdReferencingInsert(referenced, release)
  void hold.catch(referenced.reject)
  let pending: Promise<T> | undefined
  let closing = false
  let cleanup: Promise<void> | undefined
  const releaseAndDrain = () => {
    closing = true
    cleanup ??= (async () => {
      release.resolve()
      const outcomes = await Promise.allSettled(pending ? [pending, hold] : [hold])
      const failures = outcomes.flatMap(outcome =>
        outcome.status === 'rejected' ? [outcome.reason] : [],
      )
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1)
        throw new AggregateError(failures, 'Catalog reconciliation and FK holder cleanup failed', {
          cause: failures[0],
        })
    })()
    return cleanup
  }
  onTestFinished(releaseAndDrain)

  await referenced.promise
  if (closing) throw new Error('FK holder closed before catalog reconciliation started')
  pending = Promise.resolve().then(reconcile)
  try {
    // The actual reconciliation must settle while the reference remains held; native SQL bounds apply.
    return await pending
  } finally {
    await releaseAndDrain()
  }
}

async function holdReferencingInsert(
  referenced: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  const result =
    await transaction(sql`/* runTestStripeCatalogReconciliationWhileProductReferenced: insert */
    INSERT INTO membership_provider_products (membership_product_id, membership_provider_context_id, provider_product_id)
    SELECT id, fn_upsert_membership_provider_context_id('stripe', 'test', ${`stripe-catalog-fk-hold-${randomUUID()}`}), ${`price_fk_hold_${randomUUID()}`}
    FROM membership_products
    WHERE retired_at IS NULL ORDER BY plan, billing_interval LIMIT 1`)
  if (result.rowCount !== 1) throw new Error('Expected one owned reference to a membership product')
  referenced.resolve()
  await release.promise
}
