import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReportDialog } from '@/components/shared/report-dialog'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const discussion = posts.find(post => post.post_type === 'discussion')!

const meta = {
  title: 'Shared/Report Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  render: () => (
    <StoryFrame>
      <ReportDialog
        entityType='post'
        entityId={discussion.id}
        open
        onOpenChange={() => undefined}
      />
    </StoryFrame>
  ),
}
