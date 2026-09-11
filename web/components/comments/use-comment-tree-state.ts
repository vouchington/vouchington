'use client'

import { useLayoutEffect, useMemo, useState } from 'react'
import { buildTree, buildCommentNodeData } from './comment-tree-utils'
import { getPreference, setPreference } from '@/lib/preferences/storage'
import { previewMarkdown } from '@/lib/api/client/markdown'
import type { CommentTreeViewModel } from './comment-tree-view-model'
import type { ElectionVote, Post } from '@/types/posts'

const EMPTY_POSTS_MAP: Record<string, Post> = {}
const EMPTY_ELECTIONS_MAP: NonNullable<CommentTreeViewModel['post_elections']> = {}
const EMPTY_ELECTION_VOTES_MAP: Record<string, ElectionVote> = {}

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
  const electionVotesMap: Record<string, ElectionVote> =
    data.election_votes ?? EMPTY_ELECTION_VOTES_MAP
  const [extraComments, setExtraComments] = useState<Post[]>([])
  const [extraMarkdownToHtml, setExtraMarkdownToHtml] = useState<Record<string, string>>({})
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'best'>('new')
  const [quoteMarkdown, setQuoteMarkdown] = useState<string>('')
  const storageKey = `comments-collapsed:${rootPostId}${currentUserId ? `:${currentUserId}` : ''}`

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
  // useLayoutEffect dep array (useHydrateCollapsedComments). Without stable
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
  useHydrateCollapsedComments(storageKey, postIdsKey, mergedPostsMap, setCollapsedIds)
  const visibleCollapsedIds = new Set([...collapsedIds].filter(id => id in mergedPostsMap))

  const markdownToHtml = { ...data.markdown_to_html, ...extraMarkdownToHtml }
  const sortedTree = useSortedCommentTree(allResults, mergedPostsMap, electionsMap, sort)
  const commentNodes = sortedTree.map(comment =>
    buildCommentNodeData(comment, {
      electionVotesMap,
      electionsMap,
      markdownToHtml,
      moderationElections: isAdmin ? data.agent_moderation_elections : undefined,
      postModerations: isAdmin ? data.post_moderations : undefined,
      bookmarks: data.bookmarks,
    }),
  )

  function handleToggleCollapse(id: string) {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setPreference(storageKey, JSON.stringify([...next]))
      return next
    })
  }

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
        .catch(() => undefined)
    }
  }

  return {
    collapsedIds: visibleCollapsedIds,
    commentNodes,
    handleCommentAdded,
    handleToggleCollapse,
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

function useHydrateCollapsedComments(
  storageKey: string,
  postIdsKey: string,
  mergedPostsMap: Record<string, Post>,
  setCollapsedIds: (value: Set<string>) => void,
) {
  useLayoutEffect(() => {
    const ids = parseStoredCollapsedIds(getPreference(storageKey))
    const pruned = ids.filter(id => id in mergedPostsMap)
    setCollapsedIds(new Set(pruned))
    setPreference(storageKey, JSON.stringify(pruned))
  }, [mergedPostsMap, postIdsKey, setCollapsedIds, storageKey])
}

function parseStoredCollapsedIds(stored: string | null | undefined): string[] {
  if (!stored) return []
  try {
    const ids = JSON.parse(stored)
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}
