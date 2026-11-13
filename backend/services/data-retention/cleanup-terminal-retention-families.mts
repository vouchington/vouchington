import {
  runCopyrightOperationalRetentionCleanup,
  type CopyrightRetentionFamily,
} from './cleanup-copyright-operational.mts'
import { cleanupOperationalTombstones } from './cleanup-operational-tombstones.mts'
import { cleanupAiUsageRecords } from './cleanup-ai-usage.mts'
import { cleanupRetainedRelationIdentities } from './cleanup-retained-relation-identities.mts'
import { cleanupRetainedMediaBindings } from './cleanup-retained-media-bindings.mts'
import { cleanupLegalRecords } from './cleanup-legal-records.mts'
import { cleanupRetainedIdentityRoots } from './cleanup-retained-identities.mts'
import { cleanupAnalyticsLocalFiles } from './cleanup-analytics-local.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import { getAiUsageRawRetentionDays, type DataRetentionLimits } from './config.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export async function cleanupTerminalRetentionFamilies(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions,
  retainedPageSize: number,
): Promise<
  Pick<
    DataRetentionCleanupResult,
    | 'undoneActivityPubLikes'
    | 'staleRemoteActors'
    | 'feedHostnameBlocks'
    | 'otherHostnameBlocks'
    | 'deletedConversations'
    | 'appAttestationKeys'
    | 'aiUsageRecords'
    | 'retainedRelationIdentities'
    | 'retainedMediaBindings'
    | 'legalRecords'
    | 'retainedIdentityRoots'
  > &
    Partial<Pick<DataRetentionCleanupResult, CopyrightRetentionFamily>>
> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)

  const copyright = await runCopyrightOperationalRetentionCleanup({
    limits,
    scopes: options.copyrightScopes,
    now: options.copyrightNow,
    activeFamilies:
      options.activeCopyrightFamilies?.filter(active) ??
      options.families?.filter((family): family is CopyrightRetentionFamily =>
        family.startsWith('copyright'),
      ),
  })
  const undoneActivityPubLikes = active('undoneActivityPubLikes')
    ? await cleanupOperationalTombstones(
        'activitypub_post_likes',
        withLimits(options.undoneActivityPubLikes),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const staleRemoteActors = active('staleRemoteActors')
    ? await cleanupOperationalTombstones('remote_actors', withLimits(options.staleRemoteActors))
    : { deleted: 0, hasMore: false, continuation: null }
  const feedHostnameBlocks = active('feedHostnameBlocks')
    ? await cleanupOperationalTombstones(
        'feed_hostname_blocks',
        withLimits(options.feedHostnameBlocks),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const otherHostnameBlocks = active('otherHostnameBlocks')
    ? await cleanupOperationalTombstones(
        'other_hostname_blocks',
        withLimits(options.otherHostnameBlocks),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const deletedConversations = active('deletedConversations')
    ? await cleanupOperationalTombstones(
        'deleted_conversations',
        withLimits(options.deletedConversations),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const appAttestationKeys = active('appAttestationKeys')
    ? await cleanupOperationalTombstones(
        'app_attestation_keys',
        withLimits(options.appAttestationKeys),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const aiUsageRecords =
    !active('aiUsageRecords') || options.aiUsageRecords?.active === false
      ? { deleted: 0, hasMore: false, cursorId: null }
      : await cleanupAiUsageRecords({
          ...withLimits(options.aiUsageRecords),
          retentionDays: getAiUsageRawRetentionDays(),
        })
  const retainedRelationIdentities = active('retainedRelationIdentities')
    ? await cleanupRetainedRelationIdentities(
        retainedPageSize,
        options.retainedRelationIdentityKeys,
      )
    : []
  const retainedMediaBindings = active('retainedMediaBindings')
    ? await cleanupRetainedMediaBindings(retainedPageSize, options.retainedMediaBindingIds)
    : { scanned: 0, deleted: 0, hasMore: false }
  // Expired legal proof no longer keeps a retained user identity alive.
  const legalRecords = active('legalRecords')
    ? await cleanupLegalRecords(limits, options.legalRecords?.now, options.legalRecords?.recordIds)
    : []
  const retainedIdentityRoots = active('retainedIdentityRoots')
    ? await cleanupRetainedIdentityRoots(retainedPageSize, options.retainedIdentityRootIds)
    : []
  if (active('analyticsLocalFiles')) await cleanupAnalyticsLocalFiles()
  return {
    ...copyright,
    undoneActivityPubLikes,
    staleRemoteActors,
    feedHostnameBlocks,
    otherHostnameBlocks,
    deletedConversations,
    appAttestationKeys,
    aiUsageRecords,
    retainedRelationIdentities,
    retainedMediaBindings,
    legalRecords,
    retainedIdentityRoots,
  }
}
