import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AvailabilityIndicator } from '@/components/ui/availability-indicator'
import Link from 'next/link'

const meta = {
  title: 'Design System/Components/AvailabilityIndicator',
  component: AvailabilityIndicator,
  args: {
    status: 'idle' as const,
  },
} satisfies Meta<typeof AvailabilityIndicator>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Idle: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator status='idle' />
    </Frame>
  ),
}

export const Checking: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator status='checking' />
    </Frame>
  ),
}

export const Available: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator
        status='available'
        label='slug'
      />
    </Frame>
  ),
}

export const AvailableName: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator
        status='available'
        label='topic name'
      />
    </Frame>
  ),
}

export const TakenNoLink: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator
        status='taken'
        label='username'
      />
    </Frame>
  ),
}

export const TakenWithLink: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator
        status='taken'
        label='topic slug'
        conflict={
          <Link
            href='/topic/developer-tools'
            className='underline underline-offset-2'
          >
            Developer Tools
          </Link>
        }
      />
    </Frame>
  ),
}

export const Error: Story = {
  render: () => (
    <Frame>
      <AvailabilityIndicator
        status='error'
        label='community slug'
      />
    </Frame>
  ),
}
