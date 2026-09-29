import type { PageInfo, PaginatedResult } from '@voucha/types/pagination'
import type { ElectionVote } from '../posts'

/**
 * Base paginated response structure shared by all API endpoints
 */

export interface PaginatedResponse<TResult extends PaginatedResult> {
  results: TResult[]
  page_info: PageInfo
  bookmarks?: Record<string, Record<string, boolean>>
  election_votes?: Record<string, ElectionVote>
}
