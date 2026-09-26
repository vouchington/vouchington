import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AsideDrawer } from '@/components/aside-drawer'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Aside Drawer/Aside Drawer',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithReferralAside: Story = {
  render: () => (
    <StoryFrame>
      <AsideDrawer>
        <section className='rounded-lg border p-4'>
          <h2 className='text-sm font-semibold'>Referral links</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Sapphire Reserve referrals are open. Compare the 80,000 point offer with the $300 travel
            credit before you apply.
          </p>
        </section>
      </AsideDrawer>
    </StoryFrame>
  ),
}

export const FooterOnly: Story = {
  render: () => (
    <StoryFrame>
      <AsideDrawer showFooter />
    </StoryFrame>
  ),
}
