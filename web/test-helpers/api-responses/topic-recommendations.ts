import type { TopHashtagsResponseBody } from '@/lib/api/client/topic-recommendations'

export function makeTopHashtagsResponse(
  overrides: Partial<TopHashtagsResponseBody> = {},
): TopHashtagsResponseBody {
  return {
    results: [],
    topics: {},
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    ...overrides,
  }
}
