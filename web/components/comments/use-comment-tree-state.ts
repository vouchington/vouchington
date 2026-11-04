'use client'

import { useMemo, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { buildTree, buildCommentNodeData } from './comment-tree-utils'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import { useCommentCollapse } from './use-comment-collapse'
import { previewMarkdown } from '@/lib/api/client/markdown'
import type { CommentTreeViewModel } from './comment-tree-view-model'
import type { ElectionVote, Post, PostMetrics } from '@/types/posts'

const EMPTY_POSTS_MAP: Record<string, Post> = {}
const EMPTY_ELECTIONS_MAP: NonNullable<CommentTreeViewModel['post_elections']> = {}
const EMPTY_ELECTION_VOTES_MAP: Record<string, ElectionVote> = {}

interface ExtraSidecars {
  bookmarks: Record<string, Record<string, boolean>>
  metrics: Record<string, PostMetrics>
  votes: Record<string, ElectionVote>
}
const EMPTY_SIDECARS: ExtraSidecars = { bookmarks: {}, metrics: {}, votes: {} }

interface UseCommentTreeStateOptions {
  currentUserId: string | null
  data: CommentTreeViewModel
  isAdmin: boolean
  rootPostId: string
}

export function useCommentTreeState({
  currentUserId,
  data,
  isAdmin,
  rootPostId,
}: UseCommentTreeStateOptions) {
  const postsMap = data.posts ?? EMPTY_POSTS_MAP
  const electionsMap = data.post_elections ?? EMPTY_ELECTIONS_MAP
  const [extraComments, setExtraComments] = useState<Post[]>([])
  const [extraMarkdownToHtml, setExtraMarkdownToHtml] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<ExtraSidecars>(EMPTY_SIDECARS)
  const [moreAfter, setMoreAfter] = useState<Record<string, string>>({})
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'best'>('new')
  const [quoteMarkdown, setQuoteMarkdown] = useState<string>('')
  const electionVotesMap: Record<string, ElectionVote> = {
    ...(data.election_votes ?? EMPTY_ELECTION_VOTES_MAP),
    ...extra.votes,
  }

  const allResults = [
    ...data.results,
    ...extraComments.map(c => ({
      id: c.id,
      __entity_type: 'post' as const,
      ranking: 0,
      search_vector_ts: null,
    })),
  ]

  // useMemo is required here: mergedPostsMap and postIdsKey are in a
  // useLayoutEffect dep array (useCommentCollapse). Without stable
  // references the effect fires on every render, causing an infinite setState loop.
  // The React Compiler does not transform useEffect/useLayoutEffect deps.
  const mergedPostsMap = useMemo(
    () => ({
      ...postsMap,
      ...Object.fromEntries(extraComments.map(c => [c.id, c])),
    }),
    [extraComments, postsMap],
  )

  const postIdsKey = useMemo(
    () => Object.keys(mergedPostsMap).toSorted().join(','),
    [mergedPostsMap],
  )
  const bookmarks = { ...data.bookmarks, ...extra.bookmarks }
  const metrics = { ...data.posts_metrics, ...extra.metrics }

  async function loadReplies(id: string, after?: string) {
    try {
      const page = await fetchPostDescendants(id, after ? { after } : undefined)
      setExtraComments(prev => {
        const known = new Set(prev.map(c => c.id))
        return [...prev, ...page.results.flatMap(r => (known.has(r.id) ? [] : [page.posts[r.id]!]))]
      })
      setExtraMarkdownToHtml(prev => ({ ...prev, ...page.markdown_to_html }))
      setExtra(prev => ({
        bookmarks: { ...prev.bookmarks, ...page.bookmarks },
        metrics: { ...prev.metrics, ...page.posts_metrics },
        votes: { ...prev.votes, ...page.election_votes },
      }))
      setMoreAfter(prev => {
        const { [id]: _drop, ...rest } = prev
        return page.page_info.has_next_page && page.page_info.end_cursor
          ? { ...rest, [id]: page.page_info.end_cursor }
          : rest
      })
    } catch (err) {
      Sentry.captureException(err)
    }
  }

  const collapse = useCommentCollapse({
    currentUserId,
    rootPostId,
    mergedPostsMap,
    postIdsKey,
    serverHidden: id => bookmarks[id]?.hide === true,
    onExpand: id => {
      // The server walk stops at a comment the viewer hid, so its replies load when it opens.
      const loaded = Object.values(mergedPostsMap).some(post => post.parent_post_id === id)
      if (!loaded && (metrics[id]?.count.children ?? 0) > 0) void loadReplies(id)
    },
  })

  const markdownToHtml = { ...data.markdown_to_html, ...extraMarkdownToHtml }
  const sortedTree = useSortedCommentTree(allResults, mergedPostsMap, electionsMap, sort)
  const commentNodes = sortedTree.map(comment =>
    buildCommentNodeData(comment, {
      electionVotesMap,
      electionsMap,
      markdownToHtml,
      moderationElections: isAdmin ? data.agent_moderation_elections : undefined,
      postModerations: isAdmin ? data.post_moderations : undefined,
      bookmarks,
      metrics,
    }),
  )

  function handleCommentAdded(_parentId: string, comment: Post, renderedHtml?: string) {
    setExtraComments(prev => [...prev, comment])
    if (renderedHtml !== undefined) {
      setExtraMarkdownToHtml(prev => ({ ...prev, [comment.id]: renderedHtml }))
      return
    }
    if (comment.markdown) {
      previewMarkdown(comment.markdown)
        .then(({ html }) => {
          setExtraMarkdownToHtml(prev => ({ ...prev, [comment.id]: html }))
        })
        .catch(Sentry.captureException)
    }
  }

  return {
    collapsedIds: collapse.collapsedIds,
    commentNodes,
    handleCommentAdded,
    handleToggleCollapse: collapse.toggle,
    handleLoadMoreReplies: (id: string) => loadReplies(id, moreAfter[id]),
    moreRepliesIds: new Set(Object.keys(moreAfter)),
    quoteMarkdown,
    replyToId,
    setQuoteMarkdown,
    setReplyToId,
    setSort,
    sort,
  }
}

function useSortedCommentTree(
  allResults: CommentTreeViewModel['results'],
  mergedPostsMap: Record<string, Post>,
  electionsMap: NonNullable<CommentTreeViewModel['post_elections']>,
  sort: 'new' | 'best',
) {
  const tree = buildTree(allResults, mergedPostsMap)
  return tree.toSorted((a, b) => {
    if (sort === 'new') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    const aElection = a.id ? electionsMap[a.id] : undefined
    const bElection = b.id ? electionsMap[b.id] : undefined
    const aScore = aElection ? aElection.votes_count_up - aElection.votes_count_down : 0
    const bScore = bElection ? bElection.votes_count_up - bElection.votes_count_down : 0
    return bScore - aScore
  })
}
