import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DismissibleAside } from '@/components/asides/dismissible-aside'
import { StoryFrame } from '@/storybook/story-frame'

const dismissKey = 'aside-sapphire-reserve-referrals'

const meta = {
  title: 'Asides/Dismissible Aside',
  beforeEach() {
    localStorage.removeItem(dismissKey)
    return () => localStorage.removeItem(dismissKey)
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReferralOffer: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <DismissibleAside dismissKey={dismissKey}>
        <section className='rounded-lg border p-4 pr-12'>
          <h2 className='text-sm font-semibold'>Sapphire Reserve referrals</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            The public offer is 80,000 points after you spend $4,000 in three months. Confirm the
            $300 travel credit still fits your trips.
          </p>
        </section>
      </DismissibleAside>
    </StoryFrame>
  ),
}
