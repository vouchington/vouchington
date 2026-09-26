import type { CommentNodeData } from '@/components/comments/comment-tree-utils'
import type { CommentTreeViewModel } from '@/components/comments/comment-tree-view-model'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import type { Post, PostElection } from '@/types/posts'
import type { User } from '@/types/user'

const sourceComment = posts.find(post => post.post_type === 'comment')!

export const commentHtml =
  '<p>Sapphire Reserve still earns 3x at restaurants. The annual fee pays for itself if you use the $300 travel credit.</p>'

export const commentPost: Post = {
  ...sourceComment,
  markdown:
    'Sapphire Reserve still earns 3x at restaurants. The annual fee pays for itself if you use the $300 travel credit.',
  can_delete: true,
  can_edit_content: true,
  can_lock: false,
  locked_at: null,
  clearance_status: 'approved',
}

export const deletedCommentPost: Post = {
  ...commentPost,
  deleted_at: '2026-09-20T15:00:00.000Z',
  created_by: null,
  created_by_id: null,
}

export const discussionPost: Post = {
  ...posts.find(post => post.post_type === 'discussion')!,
  markdown:
    'Looking for a premium card that earns well at restaurants and still includes a useful travel credit.',
  clearance_status: 'approved',
}

export const replyPost: Post = {
  ...commentPost,
  id: 'post-comment-reply',
  title: 'Travel credit covered the lounge',
  parent_id: commentPost.id,
  markdown:
    'Agreed. Priority Pass from Sapphire Reserve covered two lounge visits booked through the travel portal.',
  can_delete: false,
  can_edit_content: false,
}

export const commentElection: PostElection = {
  __entity_type: 'post_election',
  id: 'election-post-comment',
  votes_score_net: 4,
  votes_count_up: 6,
  votes_count_down: 2,
}

export const commentNode: CommentNodeData = {
  post: commentPost,
  children: [],
  html: commentHtml,
  election: commentElection,
}

export const deletedCommentNode: CommentNodeData = {
  post: deletedCommentPost,
  children: [],
  html: null,
  election: commentElection,
}

export const commentAuthor: User = {
  ...storyCurrentUser,
  id: publicUsers[0]!.id,
  username: publicUsers[0]!.username!,
}

export const commentTreeData: CommentTreeViewModel = {
  results: [
    {
      id: commentPost.id,
      __entity_type: 'post',
      ranking: 1,
      search_vector_ts: null,
    },
  ],
  posts: { [commentPost.id]: commentPost },
  post_elections: { [commentPost.id]: commentElection },
  markdown_to_html: { [commentPost.id]: commentHtml },
}

export const emptyCommentTreeData: CommentTreeViewModel = {
  results: [],
  posts: {},
  post_elections: {},
  markdown_to_html: {},
}

export const commentPermalink = `/discussion/${discussionPost.id}/comment/${commentPost.id}`
