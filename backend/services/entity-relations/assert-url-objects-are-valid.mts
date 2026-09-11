import assert from 'http-assert'
import type { QueryOptions } from '@data-stores/psql/types'
import type { EntityRelationMetadata } from './metadata.mts'
import { getRegisteredBlockedHostnameGuard } from './blocked-hostname-guard-registry.mts'
import { getRegisteredReferralLinkGuard } from './referral-link-guard-registry.mts'
import { getEntityId, type EntityIdentifier, type UpsertEntityTypes } from './upsert-helpers.mts'

export async function assertUrlObjectsAreValid(
  relation: EntityRelationMetadata,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  userId: string | null,
  options?: QueryOptions,
): Promise<void> {
  if (relation.object_type !== 'url') return
  // No relation config today points a url-object relation at a null (remote-actor) creator —
  // this guard exists so that invariant breaks loudly instead of silently skipping the
  // hostname/referral-link checks below if one ever does.
  assert(userId, 500, 'URL-object entity relations require a non-null creator')

  const urlIds = objects.map(getEntityId)
  await getRegisteredBlockedHostnameGuard()(urlIds, userId)
  if (relation.predicate === 'related') {
    await getRegisteredReferralLinkGuard()(urlIds, userId, options)
  }
}
