import { beginTransaction } from '@data-stores/psql'
import { readEuCopyrightReportCoveragePage } from '../services/copyright-notices/eu-report-coverage.mts'

export async function readTestEuCopyrightReceiptCoverage(noticeId: string) {
  await using transaction = await beginTransaction()
  const result = await readEuCopyrightReportCoveragePage(transaction, noticeId, 'receipts', null, 1)
  await transaction.commit()
  return result
}
