import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReferralClicksPage } from '@/components/my/referral-clicks-page'
import { StoryFrame } from '@/storybook/story-frame'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import type { ReferralClickLogResponseBody } from '@/types/api-responses'

const meta = {
  title: 'My/Referral Clicks Page',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }
const username = storyCurrentUser.username ?? 'cardholder'
const alex = publicUsers[0]!

const withClicks: ReferralClickLogResponseBody = {
  results: [
    { __entity_type: 'referral_click_log', id: 'click-alex' },
    { __entity_type: 'referral_click_log', id: 'click-anon' },
  ],
  clicks: {
    'click-alex': {
      __entity_type: 'referral_click_log',
      id: 'click-alex',
      landing_url: `https://voucha.ai/@${username}/rewards`,
      user_id: alex.id,
      signed_up_at: '2026-08-14T16:05:00.000Z',
      created_at: '2026-08-14T16:02:00.000Z',
    },
    'click-anon': {
      __entity_type: 'referral_click_log',
      id: 'click-anon',
      landing_url: `https://voucha.ai/@${username}`,
      user_id: null,
      signed_up_at: null,
      created_at: '2026-09-02T18:20:00.000Z',
    },
  },
  users: { [alex.id]: alex },
  page_info: pageInfo,
}

export const WithClicks: Story = {
  render: () => (
    <StoryFrame>
      <ReferralClicksPage initialData={withClicks} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ReferralClicksPage
        initialData={{ results: [], clicks: {}, users: {}, page_info: pageInfo }}
      />
    </StoryFrame>
  ),
}
