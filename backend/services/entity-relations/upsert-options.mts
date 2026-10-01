import type { OwnedTransaction } from '@data-stores/psql'
import { deferNotificationReconcileForRelations } from './notification-reconcile.mts'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'

export type UpsertEntityRelationOptions =
  | (UpsertEntityRelationsOptions & {
      deferNotificationReconcile?: false | undefined
      suppressNotificationReconcile?: boolean
    })
  | (Omit<UpsertEntityRelationsOptions, 'query'> & {
      deferNotificationReconcile: true
      query: OwnedTransaction
      suppressNotificationReconcile?: boolean
    })

export function prepareUpsertEntityRelationOptions(
  options: UpsertEntityRelationOptions | undefined,
) {
  const suppressNotificationReconcile = options?.suppressNotificationReconcile === true
  const deferredNotification = options?.deferNotificationReconcile
    ? deferNotificationReconcileForRelations(options.query)
    : undefined
  if (!options?.deferNotificationReconcile)
    return { deferredNotification, relationOptions: options, suppressNotificationReconcile }
  const { deferNotificationReconcile: _, ...relationOptions } = options
  return { deferredNotification, relationOptions, suppressNotificationReconcile }
}
