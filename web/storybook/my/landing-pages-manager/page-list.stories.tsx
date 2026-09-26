import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PageList } from '@/components/my/landing-pages-manager/page-list'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Page List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const username = storyCurrentUser.username ?? 'cardholder'

const travelPage = {
  ...landingPageWithItems,
  id: 'landing-page-travel',
  title: 'Travel redemptions',
  slug: 'travel',
  is_default: false,
  subtitle: 'Flights and hotels I book with points.',
}

export const WithPages: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PageList
        pages={[landingPageWithItems, travelPage]}
        selectedPage={landingPageWithItems}
        username={username}
        onSelectPage={() => {}}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PageList
        pages={[]}
        selectedPage={null}
        username={username}
        onSelectPage={() => {}}
      />
    </StoryFrame>
  ),
}
