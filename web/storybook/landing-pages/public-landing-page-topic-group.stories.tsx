import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PublicLandingPageTopicGroup } from '@/components/landing-pages/public-landing-page-topic-group'
import { useTranslations } from '@/lib/i18n/use-translations'
import { landingPageCandidates, landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Landing Pages/Public Landing Page Topic Group',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SapphireReserveGroup() {
  const t = useTranslations()
  const item = landingPageWithItems.items.find(entry => entry.type === 'topic_group')
  if (item?.type !== 'topic_group') return null
  const referralEntry = {
    id: 'lp-entry-referral',
    type: 'referral_link' as const,
    referral_link: landingPageCandidates.referral_links[0]!,
  }
  return (
    <PublicLandingPageTopicGroup
      item={{ ...item, entries: [...item.entries, referralEntry] }}
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
