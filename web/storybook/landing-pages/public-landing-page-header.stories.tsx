import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PublicLandingPageHeader } from '@/components/landing-pages/public-landing-page-header'
import { publicLandingPage } from '@/storybook/entities/fixtures/landing'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Landing Pages/Public Landing Page Header',
  component: PublicLandingPageHeader,
} satisfies Meta<typeof PublicLandingPageHeader>

export default meta
type Story = StoryObj<typeof meta>

const page = publicLandingPage.landing_page
const user = publicLandingPage.user

export const RewardsSetup: Story = {
  args: {
    canonicalHref: `/u/${user.username}/${page.slug}`,
    displayName: user.display_name,
    profileImagePath: null,
    subtitle: page.subtitle,
    title: page.title,
    userMarkdown: user.markdown,
    username: user.username,
  },
  render: args => (
    <StoryFrame>
      <PublicLandingPageHeader {...args} />
    </StoryFrame>
  ),
}
