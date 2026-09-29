import type { OwnedTransaction } from '@data-stores/psql'
import { deferNotificationReconcileForRelations } from './notification-reconcile.mts'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'

export type UpsertEntityRelationOptions =
  | (UpsertEntityRelationsOptions & { deferNotificationReconcile?: false | undefined })
  | (Omit<UpsertEntityRelationsOptions, 'query'> & {
      deferNotificationReconcile: true
      query: OwnedTransaction
    })

export function prepareUpsertEntityRelationOptions(
  options: UpsertEntityRelationOptions | undefined,
) {
  const deferredNotification = options?.deferNotificationReconcile
    ? deferNotificationReconcileForRelations(options.query)
    : undefined
  if (!options?.deferNotificationReconcile)
    return { deferredNotification, relationOptions: options }
  const { deferNotificationReconcile: _, ...relationOptions } = options
  return { deferredNotification, relationOptions }
}
