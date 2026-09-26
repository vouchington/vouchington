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
        candidates={landingPageCandidates}
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
        candidates={{ profile_links: [], reviews: [], referral_links: [] }}
        username={username}
      />
    </StoryFrame>
  ),
}
