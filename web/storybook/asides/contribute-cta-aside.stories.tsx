import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContributeCtaAside } from '@/components/asides/contribute-cta-aside'
import { storyCurrentUser } from '@/storybook/entities/entity-fixtures'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Asides/Contribute CTA Aside',
  component: ContributeCtaAside,
  parameters: { auth: { currentUser: storyCurrentUser } },
  render: () => (
    <StoryFrame width='max-w-sm'>
      <ContributeCtaAside />
    </StoryFrame>
  ),
} satisfies Meta<typeof ContributeCtaAside>

export default meta
type Story = StoryObj<typeof meta>

export const SignedIn: Story = {}
