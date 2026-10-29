import { read, type QueryExecutor } from '@data-stores/psql'
import {
  attachIntegrityPenaltyLabels,
  type IntegrityPenaltyLabels,
} from '@services/integrity-labels'

export type { IntegrityPenaltyLabels }

export function attachReportIntegrityPenaltyLabels<T extends { id: string }>(
  penalties: T[],
  query: QueryExecutor = read,
): Promise<Array<T & IntegrityPenaltyLabels>> {
  return attachIntegrityPenaltyLabels('report', penalties, query)
}
