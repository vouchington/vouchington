import { beginTransaction } from '@data-stores/psql'
import { createCopyrightNoticeAggregateInTransaction } from '../../../services/copyright-notices/create.mts'
import type {
  CopyrightNoticeRecord,
  CreateCopyrightNoticeAggregateInput,
} from '../../../services/copyright-notices/types.mts'

/** Commits a US DMCA notice aggregate through the production insert used by intake admission. */
export async function createCopyrightNoticeAggregate(
  input: CreateCopyrightNoticeAggregateInput,
): Promise<CopyrightNoticeRecord> {
  await using transaction = await beginTransaction()
  const notice = await createCopyrightNoticeAggregateInTransaction(input, transaction)
  await transaction.commit()
  return notice
}
