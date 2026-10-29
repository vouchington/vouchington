'use client'

import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { TopicRecommendationEditablePostWithId } from './topic-recommendation-editable-state'
import type { TopicRecommendationTablePost } from './topic-recommendation-table-post'
import type { Post } from '@/types/posts'
import { TopicRecommendationDialog } from './topic-recommendation-dialog'
import { TopicRecommendationsTableRow } from './topic-recommendations-table-row'
import { useTopicRecommendationActions } from './topic-recommendations-table-actions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  data: Pick<
    PostsResponseBody,
    'post_elections' | 'election_votes' | 'markdown_to_html' | 'users'
  > & {
    results: Array<Pick<PostsResponseBody['results'][number], 'id'>>
    posts: PostsResponseBody['posts']
  }
  isAdmin: boolean
  hideDownCount?: boolean
}

export type { TopicRecommendationTablePost } from './topic-recommendation-table-post'

function assertRecommendationSlugs(
  posts: PostsResponseBody['posts'],
): asserts posts is Record<string, Post & { slug: string }> {
  for (const post of Object.values(posts)) {
    if (!post.slug) throw new Error('Topic recommendation is missing its slug')
  }
}

export function TopicRecommendationsTable({ data, isAdmin, hideDownCount = false }: Props) {
  const tablePosts = data.posts
  assertRecommendationSlugs(tablePosts)
  const t = useTranslations()
  const actions = useTopicRecommendationActions(
    data.results.flatMap(r => {
      const p = tablePosts[r.id]
      return p?.topic_recommendation ? [p.id] : []
    }),
  )

  const posts = data.results.flatMap(result => {
    const post = tablePosts[result.id]
    return post?.topic_recommendation && !actions.withdrawnIds.has(post.id) ? [post] : []
  })

  const orderedPostIds = posts.map(p => p.id)
  const selected = actions.selectedId ? (tablePosts[actions.selectedId] ?? null) : null
  const selectedHtml = actions.selectedId ? (data.markdown_to_html?.[actions.selectedId] ?? '') : ''
  const selectedElection = selected?.id ? data.post_elections?.[selected.id] : undefined
  const selectedVote = selected?.id ? data.election_votes?.[selected.id] : undefined

  function handlePersistChanges(post: TopicRecommendationEditablePostWithId) {
    if (!actions.editableState) return Promise.resolve()
    return actions.persistChanges(post, actions.editableState)
  }

  function handleApprove(post: TopicRecommendationEditablePostWithId) {
    if (!actions.editableState) return Promise.resolve()
    return actions.handleApprove(post, actions.editableState)
  }

  const handleReject = (post: TopicRecommendationEditablePostWithId) => {
    if (!actions.editableState) return Promise.resolve()
    return actions.handleReject(tablePosts, post, actions.editableState)
  }

  function openDialog(post: TopicRecommendationTablePost) {
    actions.openDialog(post)
  }

  return (
    <>
      <div
        data-pw='topic-recommendations-table'
        className='overflow-hidden rounded-md border bg-background'
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t(
                  'extracted.topicRecommendations.topicRecommendationsTable.recommendation_bc92e0e3',
                )}
              </TableHead>
              <TableHead>
                {t('extracted.topicRecommendations.topicRecommendationsTable.votes_cd8e974b')}
              </TableHead>
              <TableHead>
                {t('extracted.topicRecommendations.topicRecommendationsTable.status_920e413c')}
              </TableHead>
              <TableHead className='text-right'>
                {t('extracted.topicRecommendations.topicRecommendationsTable.actions_ff8059dc')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map(post => {
              const election = data.post_elections?.[post.id]
              const existingVote = data.election_votes?.[post.id]

              return (
                <TopicRecommendationsTableRow
                  key={post.id}
                  election={election}
                  existingVote={existingVote}
                  hideDownCount={hideDownCount}
                  isAdmin={isAdmin}
                  post={post}
                  onOpen={openDialog}
                  onWithdraw={actions.handleWithdraw}
                  onQuickApprove={actions.handleQuickApprove}
                  onQuickReject={actions.handleQuickReject}
                />
              )
            })}
          </TableBody>
        </Table>
      </div>

      <TopicRecommendationDialog
        editableState={actions.editableState}
        isAdmin={isAdmin}
        isSaving={actions.isSaving}
        selected={selected}
        selectedElection={selectedElection}
        selectedHtml={selectedHtml}
        selectedVote={selectedVote}
        hideDownCount={hideDownCount}
        orderedPostIds={orderedPostIds}
        users={data.users}
        navigateToId={id => actions.navigateToId(tablePosts, id)}
        setEditableState={actions.setEditableState}
        onApprove={handleApprove}
        onOpenChange={open => !open && actions.closeDialog()}
        onPersistChanges={handlePersistChanges}
        onReject={handleReject}
      />
    </>
  )
}
