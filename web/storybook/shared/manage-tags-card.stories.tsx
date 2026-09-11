import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ManageTagsCard } from '@/components/tags/manage-tags-card'

const meta = {
  title: 'Shared/ManageTagsCard',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-5'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <ManageTagsCard heading='Category'>
        <div className='text-sm text-muted-foreground'>Tag content goes here</div>
      </ManageTagsCard>
    </Frame>
  ),
}

export const WithTagList: Story = {
  render: () => (
    <Frame>
      <ManageTagsCard heading='Category'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 text-sm'>
            <span>↑</span>
            <span>Artificial Intelligence</span>
          </div>
          <div className='flex items-center gap-2 text-sm'>
            <span>↑</span>
            <span>Machine Learning</span>
          </div>
        </div>
      </ManageTagsCard>
    </Frame>
  ),
}

export const WithoutCardStyles: Story = {
  render: () => (
    <Frame>
      <ManageTagsCard
        heading='Category'
        hideCardStyles
      >
        <div className='text-sm text-muted-foreground'>
          Tag content inside a dialog-like container (no Card wrapper)
        </div>
      </ManageTagsCard>
    </Frame>
  ),
}
