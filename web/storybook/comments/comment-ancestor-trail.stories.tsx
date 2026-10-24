import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommentAncestorTrail } from '@/components/comments/comment-ancestor-trail'
import { StoryFrame } from '@/storybook/story-frame'
import type { PostsResponseBody } from '@/types/api-responses'

const meta = {
  title: 'Comments/Comment Ancestor Trail',
  component: CommentAncestorTrail,
} satisfies Meta<typeof CommentAncestorTrail>

export default meta
type Story = StoryObj<typeof meta>

const ancestors: PostsResponseBody = {
  results: [],
  page_info: { has_next_page: true, start_cursor: null, end_cursor: 'earlier-comments' },
  posts: {},
  posts_metrics: {},
  post_elections: {},
  election_votes: {},
  markdown_to_html: {},
}

export const EarlierReplies: Story = {
  args: {
    targetCommentId: 'comment-target',
    rootPostId: 'post-root',
    rootPostPath: '/discussion/post-root',
    initialAncestors: ancestors,
  },
  render: args => (
    <StoryFrame>
      <CommentAncestorTrail {...args} />
    </StoryFrame>
  ),
}
