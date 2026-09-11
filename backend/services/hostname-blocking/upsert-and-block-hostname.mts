import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
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

  await invalidate.url_hostnames(...hostnames)
  enqueueBlockHostnameVoteWeightRecalculation(creatorIds)
  return { id: hostnameId, result }
}
