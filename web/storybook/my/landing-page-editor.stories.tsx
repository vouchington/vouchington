import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPageEditor } from '@/components/my/landing-page-editor'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageCandidates, landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Landing Page Editor',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const username = storyCurrentUser.username ?? 'cardholder'

export const WithContent: Story = {
  render: () => (
    <StoryFrame>
      <LandingPageEditor
        initialPage={landingPageWithItems}
        candidatesData={{
          candidates: landingPageCandidates,
          item_limit: 100,
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
        username={username}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <LandingPageEditor
        initialPage={{ ...landingPageWithItems, items: [] }}
        candidatesData={{
          candidates: { profile_links: [], reviews: [], referral_links: [] },
          item_limit: 100,
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
        username={username}
      />
    </StoryFrame>
  ),
}
