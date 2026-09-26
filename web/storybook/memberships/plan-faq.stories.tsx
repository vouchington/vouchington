import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlanFAQ } from '@/components/memberships/plan-faq'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Plan FAQ',
  component: PlanFAQ,
} satisfies Meta<typeof PlanFAQ>

export default meta
type Story = StoryObj<typeof meta>

function Faq() {
  const t = useTranslations()
  return <PlanFAQ t={t} />
}

export const Questions: Story = {
  render: () => (
    <StoryFrame>
      <Faq />
    </StoryFrame>
  ),
}
