import { useLayoutEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CommentPermalink } from '@/components/comments/comment-permalink'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import {
  commentAuthor,
  commentHtml,
  commentPost,
  deletedCommentPost,
  discussionPost,
  replyPost,
} from './comment-story-data'

const pageInfo = {
  has_next_page: false,
  has_previous_page: false,
  start_cursor: null,
  end_cursor: null,
}

const replyHtml =
  '<p>Agreed. Priority Pass from Sapphire Reserve covered two lounge visits booked through the travel portal.</p>'

function pageFor(post: Post, html: string | null): PostsResponseBody {
  return {
    results: [
      {
        __entity_type: 'post',
        id: post.id,
        ranking: 1,
        search_vector_ts: null,
        entity_id: post.id,
        post_type: post.post_type,
      },
    ],
    page_info: pageInfo,
    posts: { [post.id]: post },
    posts_metrics: {},
    markdown_to_html: html ? { [post.id]: html } : {},
  } as PostsResponseBody
}

const emptyPage = {
  results: [],
  page_info: pageInfo,
  posts: {},
  posts_metrics: {},
  markdown_to_html: {},
} as PostsResponseBody

const meta = {
  title: 'Comments/Comment Permalink',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function PermalinkPreview({ target }: { target: Post }) {
  const t = useTranslations()
  const html = target.deleted_at ? null : commentHtml
  useLayoutEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    root.classList.remove('dark')
    return () => {
      if (hadDark) root.classList.add('dark')
    }
  }, [])
  return (
    <StoryFrame>
      <CommentPermalink
        targetCommentId={target.id}
        rootPostId={discussionPost.id}
        rootPostType='discussion'
        rootPost={discussionPost}
        ancestors={pageFor(target, html)}
        descendants={target.deleted_at ? emptyPage : pageFor(replyPost, replyHtml)}
        isAdmin={false}
        hideDownCount={false}
        t={t}
      />
    </StoryFrame>
  )
}

export const WithReply: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <PermalinkPreview target={commentPost} />,
}

export const Deleted: Story = {
  parameters: { auth: { currentUser: commentAuthor } },
  render: () => <PermalinkPreview target={deletedCommentPost} />,
}
