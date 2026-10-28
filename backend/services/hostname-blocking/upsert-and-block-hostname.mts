import { beginTransaction } from '@data-stores/psql'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import createHttpError from 'http-errors'
import { type BlockHostnameResult, blockHostnameInTransaction } from './block-hostname.mts'

export type UpsertAndBlockHostnameResult = {
  id: string
  result: BlockHostnameResult
}

export async function upsertAndBlockHostname(
  adminUserId: string,
  hostname: string,
): Promise<UpsertAndBlockHostnameResult> {
  await using query = await beginTransaction()
  const hostnameMap = await prepareUrlHostnamesForOwnedMutation(adminUserId, [hostname], query)
  const hostnameId = hostnameMap.get(hostname)
  if (!hostnameId) throw createHttpError(500, 'Failed to upsert hostname')
  const result = await blockHostnameInTransaction(adminUserId, hostnameId, query)
  await query.commit()
  return { id: hostnameId, result }
}
