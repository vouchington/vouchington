import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostTimeRangeSelect } from '@/components/posts/post-time-range-select'

const meta = {
  title: 'Posts/PostTimeRangeSelect',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl gap-4 rounded-md border p-4'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <PostTimeRangeSelect />
    </Frame>
  ),
}

export const WithoutAllTime: Story = {
  render: () => (
    <Frame>
      <PostTimeRangeSelect
        options={['1w', '1m', '1y']}
        value='1y'
      />
    </Frame>
  ),
}
