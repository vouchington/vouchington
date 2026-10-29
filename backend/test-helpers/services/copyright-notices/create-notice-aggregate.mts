import { v7 as uuidv7 } from 'uuid'
import { prepareCopyrightEncryptionKey } from '../../../services/copyright-notices/encryption-keys.mts'
import { beginTransaction } from '@data-stores/psql'
import { createCopyrightNoticeAggregateInTransaction } from '../../../services/copyright-notices/create.mts'
import type {
  CopyrightNoticeRecord,
  CreateCopyrightNoticeAggregateInput,
} from '../../../services/copyright-notices/types.mts'

/** Commits a US DMCA notice aggregate through the production insert used by intake admission. */
export async function createCopyrightNoticeAggregate(
  input: Omit<CreateCopyrightNoticeAggregateInput, 'secretPurpose'> & { secretPurpose?: string },
): Promise<CopyrightNoticeRecord> {
  // The UUID-backed notice clock follows the fixture's explicit receipt time, including fake dates.
  const noticeId = uuidv7({ msecs: input.receivedAt.getTime() })
  await using key = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  const notice = await createCopyrightNoticeAggregateInTransaction(
    { ...input, secretPurpose: input.secretPurpose ?? `copyright-fixture:${noticeId}` },
    transaction,
    { noticeId, key },
  )
  await transaction.commit()
  return notice
}
