import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPagesIndex } from '@/components/my/landing-pages-index'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Landing Pages Index',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const travelPage = {
  ...landingPageWithItems,
  id: 'landing-page-travel',
  title: 'Travel redemptions',
  slug: 'travel',
  is_default: false,
  subtitle: 'Flights and hotels I book with points.',
  items: [],
}

export const WithPages: Story = {
  render: () => (
    <StoryFrame>
      <LandingPagesIndex
        username={storyCurrentUser.username ?? null}
        initialPages={[landingPageWithItems, travelPage]}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <LandingPagesIndex
        username={storyCurrentUser.username ?? null}
        initialPages={[]}
      />
    </StoryFrame>
  ),
}

export const MissingUsername: Story = {
  render: () => (
    <StoryFrame>
      <LandingPagesIndex
        username={null}
        initialPages={[]}
      />
    </StoryFrame>
  ),
}
