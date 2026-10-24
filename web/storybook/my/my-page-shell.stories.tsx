import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyPageShell } from '@/components/my/my-page-shell'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Page Shell',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SettingsRoute: Story = {
  parameters: { nextjs: { navigation: { pathname: '/my/identity' } } },
  render: () => (
    <StoryFrame width='max-w-4xl'>
      <MyPageShell>
        <p className='text-sm text-muted-foreground'>Settings page content renders here.</p>
      </MyPageShell>
    </StoryFrame>
  ),
}

export const NonSettingsRoute: Story = {
  parameters: { nextjs: { navigation: { pathname: '/my/landing-page' } } },
  render: () => (
    <StoryFrame width='max-w-4xl'>
      <MyPageShell>
        <p className='text-sm text-muted-foreground'>Content outside the settings routes.</p>
      </MyPageShell>
    </StoryFrame>
  ),
}
