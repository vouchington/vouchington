import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PublicLandingPageTopicGroup } from '@/components/landing-pages/public-landing-page-topic-group'
import { useTranslations } from '@/lib/i18n/use-translations'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Landing Pages/Public Landing Page Topic Group',
  component: PublicLandingPageTopicGroup,
} satisfies Meta<typeof PublicLandingPageTopicGroup>

export default meta
type Story = StoryObj<typeof meta>

function SapphireReserveGroup() {
  const t = useTranslations()
  const item = landingPageWithItems.items.find(entry => entry.type === 'topic_group')
  if (item?.type !== 'topic_group') return null
  return (
    <PublicLandingPageTopicGroup
      item={item}
      t={t}
    />
  )
}

export const SapphireReserve: Story = {
  render: () => (
    <StoryFrame>
      <SapphireReserveGroup />
    </StoryFrame>
  ),
}
