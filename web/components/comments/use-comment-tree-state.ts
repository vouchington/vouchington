'use client'

import { useMemo, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { buildTree, buildCommentNodeData } from './comment-tree-utils'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import { useCommentCollapse } from './use-comment-collapse'
import { previewMarkdown } from '@/lib/api/client/markdown'
import type { CommentTreeViewModel } from './comment-tree-view-model'
import { EMPTY_SIDECARS, mergeCommentSidecars, type Sidecars } from './comment-tree-sidecars'
import type { Post } from '@/types/posts'

const EMPTY_POSTS_MAP: Record<string, Post> = {}

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
  const [extraComments, setExtraComments] = useState<Post[]>([])
  const [extraMarkdownToHtml, setExtraMarkdownToHtml] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<Sidecars>(EMPTY_SIDECARS)
  const [moreAfter, setMoreAfter] = useState<Record<string, string>>({})
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'best'>('new')
  const [quoteMarkdown, setQuoteMarkdown] = useState<string>('')
  const requestedReplies = useRef(new Set<string>())
  const merged = mergeCommentSidecars(data, extra)
  const electionsMap = merged.post_elections
  const electionVotesMap = merged.election_votes

  // A later page of the root thread can return a reply that was already fetched on expand, and
  // buildTree attaches one node per entry, so each id is kept once across both sources.
  const seenIds = new Set(data.results.map(r => r.id))
  const allResults = [
    ...data.results,
    ...extraComments.flatMap(c =>
      seenIds.has(c.id)
        ? []
        : [
            {
              id: c.id,
              __entity_type: 'post' as const,
              ranking: 0,
              search_vector_ts: null,
            },
          ],
    ),
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
  const { bookmarks, posts_metrics: metrics } = merged

  async function loadReplies(id: string, after?: string) {
    try {
      const page = await fetchPostDescendants(id, after ? { after } : undefined)
      setExtraComments(prev => {
        const known = new Set(prev.map(c => c.id))
        return [...prev, ...page.results.flatMap(r => (known.has(r.id) ? [] : [page.posts[r.id]!]))]
      })
      setExtraMarkdownToHtml(prev => ({ ...prev, ...page.markdown_to_html }))
      setExtra(prev => mergeCommentSidecars(prev, page))
      setMoreAfter(prev => {
        const { [id]: _drop, ...rest } = prev
        return page.page_info.has_next_page && page.page_info.end_cursor
          ? { ...rest, [id]: page.page_info.end_cursor }
          : rest
      })
    } catch (err) {
      requestedReplies.current.delete(id)
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
      // Not gated on count.children: it counts public direct replies only, so it misses the
      // viewer's own uncleared replies and placeholders that lead to a valid reply.
      if (loaded || requestedReplies.current.has(id)) return
      requestedReplies.current.add(id)
      void loadReplies(id)
    },
  })

  const markdownToHtml = { ...data.markdown_to_html, ...extraMarkdownToHtml }
  const sortedTree = useSortedCommentTree(allResults, mergedPostsMap, electionsMap, sort)
  const commentNodes = sortedTree.map(comment =>
    buildCommentNodeData(comment, {
      electionVotesMap,
      electionsMap,
      markdownToHtml,
      moderationElections: isAdmin ? merged.agent_moderation_elections : undefined,
      postModerations: isAdmin ? merged.post_moderations : undefined,
      bookmarks,
      metrics,
    }),
  )

  function handleCommentAdded(_parentId: string, comment: Post, renderedHtml?: string) {
    // An expand fetch that was in flight when the viewer replied may already hold this comment.
    setExtraComments(prev => (prev.some(c => c.id === comment.id) ? prev : [...prev, comment]))
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
