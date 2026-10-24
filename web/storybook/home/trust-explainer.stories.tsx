import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { VouchaPillars } from '@/components/home/trust-explainer'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'

const meta = { title: 'Home/Trust Explainer' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

function PillarsPreview() {
  const t = useTranslations()
  return (
    <StoryFrame>
      <VouchaPillars t={t} />
    </StoryFrame>
  )
}

export const Pillars: Story = { render: () => <PillarsPreview /> }
