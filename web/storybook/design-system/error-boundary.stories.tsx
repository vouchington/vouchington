import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ErrorBoundary } from '@/components/ui/error-boundary'

const meta = {
  title: 'Design System/Components/ErrorBoundary',
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-md rounded-md border p-3'>{children}</div>
  </main>
)

export const Content: Story = {
  args: {
    fallback: <p>Something went wrong.</p>,
    children: <p>Child content rendered normally.</p>,
  },
  render: args => (
    <Frame>
      <ErrorBoundary {...args} />
    </Frame>
  ),
}
