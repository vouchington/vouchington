import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PublicLandingPageItems } from '@/components/landing-pages/public-landing-page-items'
import { useTranslations } from '@/lib/i18n/use-translations'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Landing Pages/Public Landing Page Items',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Items({ items }: { items: typeof landingPageWithItems.items }) {
  const t = useTranslations()
  return (
    <PublicLandingPageItems
      items={items}
      t={t}
    />
  )
}

export const RewardsSetup: Story = {
  render: () => (
    <StoryFrame>
      <Items items={landingPageWithItems.items} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Items items={[]} />
    </StoryFrame>
  ),
}
