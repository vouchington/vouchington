/**
 * Shared pagination types used by both backend API responses and frontend consumers.
 * These types are identical on both sides — no Date→string conversion needed.
 *
 * Note: PaginatedResponse is NOT shared here because its election_votes field references
 * ElectionVote, which has different shapes (Date vs string) in backend vs frontend.
 * Each side defines PaginatedResponse locally importing ElectionVote from its own source.
 */

/**
 * Pagination information for cursor-based pagination
 */
export type PageInfo = {
  has_next_page: boolean
  end_cursor: string | null
  start_cursor: string | null
}

/**
 * Standard response for non-paginated lists converted to paginated format
 */
export type ListResponse<T> = {
  results: T[]
  page_info: PageInfo
}

/**
 * Base result item structure for paginated responses
 */
export type PaginatedResult<TEntityType extends string = string> = {
  __entity_type: TEntityType
  id: string
}
