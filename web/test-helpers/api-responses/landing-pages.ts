import type { LandingPageCandidatesResponseBody } from '@/types/api-responses'

export function makeLandingPageCandidatesResponse(
  overrides: Partial<LandingPageCandidatesResponseBody> = {},
): LandingPageCandidatesResponseBody {
  return {
    candidates: { profile_links: [], reviews: [], referral_links: [] },
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    item_limit: 100,
    ...overrides,
  }
}
