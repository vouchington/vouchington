'use client'

import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import type {
  TopicRecommendationEditablePost,
  TopicRecommendationEditablePostWithId,
} from './topic-recommendation-editable-state'
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
    posts: Record<string, TopicRecommendationTablePost>
  }
  isAdmin: boolean
  hideDownCount?: boolean
}

export type TopicRecommendationTablePost = TopicRecommendationEditablePost &
  Pick<Post, 'id' | 'updated_at' | 'created_at' | 'created_by' | 'created_by_id'>

export function TopicRecommendationsTable({ data, isAdmin, hideDownCount = false }: Props) {
  const t = useTranslations()
  const actions = useTopicRecommendationActions(
    data.results.flatMap(r => {
      const p = data.posts[r.id]
      return p?.topic_recommendation ? [p.id] : []
    }),
  )

  const posts = data.results.flatMap(result => {
    const post = data.posts[result.id]
    return post?.topic_recommendation && !actions.withdrawnIds.has(post.id) ? [post] : []
  })

  const orderedPostIds = posts.map(p => p.id)
  const selected = actions.selectedId ? (data.posts[actions.selectedId] ?? null) : null
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

  function handleReject(post: TopicRecommendationEditablePostWithId) {
    if (!actions.editableState) return Promise.resolve()
    return actions.handleReject(data.posts, post, actions.editableState)
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
        navigateToId={id => actions.navigateToId(data.posts, id)}
        setEditableState={actions.setEditableState}
        onApprove={handleApprove}
        onOpenChange={open => !open && actions.closeDialog()}
        onPersistChanges={handlePersistChanges}
        onReject={handleReject}
      />
    </>
  )
}
