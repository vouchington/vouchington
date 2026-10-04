import type { QueryContract, PaginationRuntimeLimitBounds } from '@modules/pagination'
import { getPaginationLimitsForContract } from '@services/pagination'
export function parseRuntimePagination<T>(
  parser: {
    queryContract: QueryContract
    parse(query: Record<string, unknown>, bounds?: PaginationRuntimeLimitBounds): T
  },
  query: Record<string, unknown>,
  bounds?: PaginationRuntimeLimitBounds,
): T {
  return parser.parse(query, bounds ?? getPaginationLimitsForContract(parser.queryContract))
}
