import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThirdPartyText } from '@/components/shared/third-party-text'

const meta = {
  title: 'Shared/ThirdPartyText',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-4'>{children}</div>
  </main>
)

export const LeftToRight: Story = {
  render: () => (
    <Frame>
      <ThirdPartyText
        as='p'
        text='A post written on another service'
      />
    </Frame>
  ),
}

export const RightToLeft: Story = {
  render: () => (
    <Frame>
      <ThirdPartyText
        as='p'
        text='نص من خدمة أخرى'
      />
    </Frame>
  ),
}

export const Inline: Story = {
  render: () => (
    <Frame>
      <ThirdPartyText
        as='span'
        className='text-muted-foreground'
        text='Display name from another service'
      />
    </Frame>
  ),
}
