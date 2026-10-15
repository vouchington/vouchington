import { beginTransaction } from '@data-stores/psql'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import onError from '@modules/on-error'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import createHttpError from 'http-errors'
import {
  type BlockHostnameResult,
  blockHostnameInTransaction,
  enqueueBlockHostnameVoteWeightRecalculation,
} from './block-hostname.mts'

export type UpsertAndBlockHostnameResult = {
  id: string
  result: BlockHostnameResult
}

export async function upsertAndBlockHostname(
  adminUserId: string,
  hostname: string,
): Promise<UpsertAndBlockHostnameResult> {
  await using query = await beginTransaction()
  const hostnameMap = await upsertUrlHostnames(adminUserId, [hostname], { query })
  const hostnameId = hostnameMap.get(hostname)
  if (!hostnameId) throw createHttpError(500, 'Failed to upsert hostname')
  const { result, hostnames, creatorIds } = await blockHostnameInTransaction(
    adminUserId,
    hostnameId,
    query,
  )
  await query.commit()

  await drainHostnameCacheInvalidationWork({
    hostnameIds: hostnames.map(affected => affected.id),
  }).catch(onError)
  enqueueBlockHostnameVoteWeightRecalculation(creatorIds)
  return { id: hostnameId, result }
}
