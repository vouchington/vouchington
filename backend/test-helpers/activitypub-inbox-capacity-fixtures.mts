import { ACTIVITYPUB_INBOX_STORAGE_POLICY as policy } from '../modules/activitypub-inbox-storage-policy/index.mts'
import { getActivityPubInboxStorageSnapshot } from '../services/ap-inbox-activities/index.mts'
import { insertActivityPubInboxCapacityDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'

// The current work-item constraint bounds each body to 1 MiB; fill the global cap across rows.
const MAXIMUM_FIXTURE_BODY_BYTES = 1024 * 1024
const BYTE_FILL_BATCH_ROWS = 32

/** Fill real physical capacity without replacing foreign rows or the trigger-maintained ledger. */
export async function fillActivityPubInboxRowCapacity(remainingRows: number) {
  const before = await getActivityPubInboxStorageSnapshot()
  const count = policy.maximumUnverifiedRows - remainingRows - before.unverifiedRows
  if (
    before.unverifiedRows >= policy.maximumUnverifiedRows ||
    before.unverifiedRawBodyBytes >= policy.maximumUnverifiedRawBodyBytes ||
    count < 0 ||
    before.unverifiedRawBodyBytes + count + remainingRows > policy.maximumUnverifiedRawBodyBytes
  ) {
    throw new Error(
      `ActivityPub row fixture cannot reserve capacity from baseline ${JSON.stringify(before)}`,
    )
  }
  const ids = await insertActivityPubInboxCapacityDeliveriesForTest(count, 1)
  const filled = await getActivityPubInboxStorageSnapshot()
  if (
    filled.unverifiedRows !== policy.maximumUnverifiedRows - remainingRows ||
    filled.unverifiedRawBodyBytes !== before.unverifiedRawBodyBytes + count
  ) {
    throw new Error('ActivityPub physical row fill did not preserve the baseline ledger')
  }
  return { before, filled, ids }
}

export async function fillActivityPubInboxByteCapacity(remainingBytes: number) {
  const before = await getActivityPubInboxStorageSnapshot()
  const bytes =
    policy.maximumUnverifiedRawBodyBytes - remainingBytes - before.unverifiedRawBodyBytes
  const fullRows = Math.floor(bytes / MAXIMUM_FIXTURE_BODY_BYTES)
  const remainder = bytes % MAXIMUM_FIXTURE_BODY_BYTES
  const fillerRows = fullRows + (remainder > 0 ? 1 : 0)
  if (
    before.unverifiedRows >= policy.maximumUnverifiedRows ||
    before.unverifiedRawBodyBytes >= policy.maximumUnverifiedRawBodyBytes ||
    bytes < 0 ||
    before.unverifiedRows + fillerRows + 2 > policy.maximumUnverifiedRows
  ) {
    throw new Error(
      `ActivityPub byte fixture cannot reserve capacity from baseline ${JSON.stringify(before)}`,
    )
  }
  const ids: string[] = []
  for (let offset = 0; offset < fullRows; offset += BYTE_FILL_BATCH_ROWS) {
    const count = Math.min(BYTE_FILL_BATCH_ROWS, fullRows - offset)
    ids.push(
      ...(await insertActivityPubInboxCapacityDeliveriesForTest(count, MAXIMUM_FIXTURE_BODY_BYTES)),
    )
  }
  if (remainder > 0)
    ids.push(...(await insertActivityPubInboxCapacityDeliveriesForTest(1, remainder)))
  const filled = await getActivityPubInboxStorageSnapshot()
  if (
    filled.unverifiedRawBodyBytes !== policy.maximumUnverifiedRawBodyBytes - remainingBytes ||
    filled.unverifiedRows !== before.unverifiedRows + ids.length
  ) {
    throw new Error('ActivityPub physical byte fill did not preserve the baseline ledger')
  }
  return { before, filled, ids }
}
