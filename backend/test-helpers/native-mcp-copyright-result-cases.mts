import type { McpResultFixtureCase } from './native-mcp-option-result-cases.mts'

const noticeId = '0198ffff-0000-7000-8000-000000000031'
const accountId = '0198ffff-0000-7000-8000-000000000032'
const incidentId = '0198ffff-0000-7000-8000-000000000033'
const reviewId = '0198ffff-0000-7000-8000-000000000034'

/** Legal-audience copyright results; `work_description` is nullable in the schema, sampled non-null here. */
export const copyrightMcpResultCases: readonly McpResultFixtureCase[] = [
  {
    id: 'native.mcp.search-copyright-notices-for-association.results',
    tool: 'search_copyright_notices_for_association',
    arguments: { q: 'example' },
    structuredContent: {
      copyright_notices: [
        {
          id: noticeId,
          claimant_display_name: 'Example Claimant',
          jurisdiction: 'us_dmca',
          received_at: '2026-10-09T00:00:00.000Z',
          work_description: 'Example work',
        },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
  },
  {
    id: 'native.mcp.list-repeat-infringer-accounts.accounts',
    tool: 'list_repeat_infringer_accounts',
    arguments: { id: noticeId },
    structuredContent: {
      copyright_repeat_infringer_accounts: [
        {
          account_user_id: accountId,
          account_username: 'example-account',
          incident_id: incidentId,
          is_operative: true,
          open_review_id: reviewId,
          termination_in_effect: false,
        },
      ],
    },
  },
]
