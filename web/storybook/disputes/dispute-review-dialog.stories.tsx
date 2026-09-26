import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DisputeReviewDialog } from '@/components/disputes/dispute-review-dialog'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Disputes/Dispute Review Dialog',
  component: DisputeReviewDialog,
} satisfies Meta<typeof DisputeReviewDialog>

export default meta
type Story = StoryObj<typeof meta>

function OpenDisputeDialog({ postId, topicId }: { postId: string; topicId: string }) {
  const [open, setOpen] = useState(true)
  return (
    <DisputeReviewDialog
      open={open}
      onOpenChange={setOpen}
      postId={postId}
      topicId={topicId}
    />
  )
}

export const Open: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    postId: posts[1]!.id,
    topicId: topics[1]!.id,
  },
  render: args => (
    <StoryFrame>
      <OpenDisputeDialog
        postId={args.postId}
        topicId={args.topicId}
      />
    </StoryFrame>
  ),
}
