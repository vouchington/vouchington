import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'
import {
  penaltyReviewCursor,
  reportActivePenalty,
  voteActivePenalty,
  terminalPage,
} from './native-integrity-penalty-data.mts'

/** Two eligible rows demonstrate continuation without requiring an older penalty decision. */
export const nativeIntegrityPenaltyReviewPaginationCases = (
  [
    {
      domain: 'report',
      first: reportActivePenalty,
      secondId: '019f7000-0000-7000-8000-000000000103',
    },
    { domain: 'vote', first: voteActivePenalty, secondId: '019f7000-0000-7000-8000-000000000204' },
  ] as const
).flatMap(({ domain, first, secondId }) => {
  const path = `/api/v1/${domain}-integrity/penalties/review-due`
  const cursor = penaltyReviewCursor(domain, first.id)
  const common = {
    method: 'GET' as const,
    path,
    route: { routeTemplate: path },
    migratedFrom: [`backend/api/v1/${domain}-integrity/penalties.mts`],
  }
  return [
    fixtureCase({
      ...common,
      id: `native.moderation.${domain}-integrity.penalties.review-due.page-1`,
      query: { limit: '1' },
      body: {
        results: [{ ...first, user_username: 'penalty-recipient' }],
        page_info: { has_next_page: true, start_cursor: cursor, end_cursor: cursor },
      },
    }),
    fixtureCase({
      ...common,
      id: `native.moderation.${domain}-integrity.penalties.review-due.page-2`,
      query: { after: cursor, limit: '1' },
      body: {
        results: [
          {
            ...first,
            id: secondId,
            user_id: '019f7000-0000-7000-8000-000000000003',
            user_username: 'later-penalty-recipient',
          },
        ],
        page_info: terminalPage(penaltyReviewCursor(domain, secondId)),
      },
    }),
  ]
})
