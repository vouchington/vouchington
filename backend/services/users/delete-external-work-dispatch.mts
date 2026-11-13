import { invalidateRssSnapshotsForLegalRemoval } from '@services/entity-cache/rss-snapshot-generation'
import { sanitizeStripeCustomer } from '@modules/stripe/customers'
import { deleteExportFromS3 } from '@services/account-data-requests'
import { purgeCacheTags } from '@services/entity-cache/purge'
import { LEGAL_REMOVAL_TAG, purgeLegalRemovalCacheTag } from '@services/entity-cache/legal-removal'
import type { UserDeletionExternalWorkKind } from '@services/user-deletions'

export type PendingExternalWork =
  | {
      id: string
      work_kind: 'entity-relation-effects'
      work_key: null
      relation_impact_id: string
      stripe_customer_id: null
    }
  | {
      id: string
      work_kind: 'stripe-customer'
      work_key: null
      relation_impact_id: null
      stripe_customer_id: string
    }
  | {
      id: string
      work_kind: Exclude<
        UserDeletionExternalWorkKind,
        'entity-relation-effects' | 'stripe-customer'
      >
      work_key: string
      relation_impact_id: null
      stripe_customer_id: null
    }

/** Execute one database-selected work kind after the caller has fenced the deletion attempt. */
export async function executeUserDeletionExternalWork(
  work: PendingExternalWork,
  requestId: string,
  processRelationEffects: (requestId: string, impactId: string) => Promise<void>,
): Promise<void> {
  if (work.work_kind === 'cloudflare-cache-tag') {
    if (work.work_key === LEGAL_REMOVAL_TAG) {
      await invalidateRssSnapshotsForLegalRemoval()
      await purgeLegalRemovalCacheTag()
    } else await purgeCacheTags([work.work_key])
  } else if (work.work_kind === 's3-export') {
    await deleteExportFromS3(work.work_key)
  } else if (work.work_kind === 'stripe-customer') {
    try {
      await sanitizeStripeCustomer(
        work.stripe_customer_id,
        undefined,
        `user-deletion__${requestId}__stripe__${work.stripe_customer_id}`,
      )
    } catch (err) {
      if (!isStripeMissingCustomerError(err)) throw err
    }
  } else if (work.work_kind === 'entity-relation-effects') {
    await processRelationEffects(requestId, work.relation_impact_id)
  } else {
    throw new Error(`Unsupported user deletion external work kind: ${String(work.work_kind)}`)
  }
}

function isStripeMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'resource_missing' &&
    'param' in error &&
    error.param === 'id'
  )
}
