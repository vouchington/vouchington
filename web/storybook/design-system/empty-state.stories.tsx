import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'

const meta = {
  title: 'Design System/Components/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-xl rounded-md border'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <EmptyState
        title='No results found'
        description='Try adjusting your search or filters to find what you are looking for.'
        icon='search'
      />
    </Frame>
  ),
}

export const WithAction: Story = {
  render: () => (
    <Frame>
      <EmptyState
        title='Nothing here yet'
        description='Create your first post to get this list started.'
        icon='inbox'
      >
        <Button>Create post</Button>
      </EmptyState>
    </Frame>
  ),
}
