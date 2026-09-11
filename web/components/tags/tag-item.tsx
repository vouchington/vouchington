'use client'

import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ScoreVote } from '@/components/votes/score-vote'
import {
  clearEntityRelationVote,
  submitEntityRelationVote,
} from '@/lib/api/client/entity-relations'
import { createPostPathname, topicHref } from '@/lib/links/entity-href'
import { humanizePostType } from '@ts-shared/utils/format'
import { getTopicTypeLabel } from '@/types/topics'
import { getPostSlugFromType } from '@/lib/route-configs'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { EntityRelation } from '@/lib/api/entity-relations'
import type { PostType } from '@/types/posts'
import { UrlEmbedRow } from './url-embed-row'
import { PostContentText } from '@/components/posts/post-content-text'

interface TagItemProps {
  relation: EntityRelation
  existingVoteChoice?: import('@/lib/api/client/elections').RelationChoice
  objectType: string
  showVoting?: boolean
  isAuthenticated?: boolean
  allowOfficialAccounts?: boolean
  onVoteSubmitted?: () => void
}

export function TagItem({
  relation,
  existingVoteChoice,
  objectType,
  showVoting = false,
  isAuthenticated = false,
  allowOfficialAccounts = true,
  onVoteSubmitted,
}: TagItemProps) {
  const t = useTranslations()
  const objectData = relation.object_data as {
    id?: string
    name?: string
    title?: string
    declared_language?: string | null
    lingua_rs_detected_language?: string | null
    slug?: string
    post_type?: string
    topic_type?: string
    url?: string
    latest_crawl?: { title: string | null; image_url: string | null } | null
  }

  const entityId = objectData.id || relation.object_id
  const submitVoteAndRefresh = async (
    id: string,
    choice: import('@/lib/api/client/elections').RelationChoice,
  ) => {
    await submitEntityRelationVote(id, choice)
    onVoteSubmitted?.()
  }

  let href = '#'
  const entityName = objectData.name || objectData.title || 'Unknown'
  let typeLabel: string | null = null

  if (objectType === 'topic') {
    const topicType = objectData.topic_type || 'topic'
    if (entityId) {
      href = topicHref({ topic_type: topicType, id: entityId, slug: objectData.slug })
    }
    typeLabel = t(getTopicTypeLabel(topicType))
  } else if (objectType === 'post') {
    const postType = (objectData.post_type || 'discussion') as PostType
    const slug = objectData.slug || entityId
    if (slug) {
      href = createPostPathname(getPostSlugFromType(postType), slug)
    }
    typeLabel = humanizePostType(postType)
  }

  return (
    <div className='flex min-w-0 items-center gap-2'>
      {showVoting && relation.id && (
        <ScoreVote
          entityType='entity_relation'
          electionId={relation.id}
          countUp={relation.votes_count_up || 0}
          countDown={relation.votes_count_down || 0}
          existingVoteChoice={existingVoteChoice}
          policy='relation'
          submitVote={submitVoteAndRefresh}
          clearVote={async id => {
            await clearEntityRelationVote(id)
            onVoteSubmitted?.()
          }}
          signedOut={!isAuthenticated}
          allowOfficialAccounts={allowOfficialAccounts}
          onError={() =>
            toast.error(t('extracted.tags.tagItem.failedToSubmitVotePleaseTryAgain_7f895b25'))
          }
          data-pw='tag-vote'
        />
      )}
      {objectType === 'url' ? (
        <UrlEmbedRow
          url={objectData.url ?? ''}
          latestCrawl={objectData.latest_crawl}
        />
      ) : (
        <>
          <PostContentText
            as={Link}
            prefetch={false}
            href={href}
            className='text-sm hover:underline'
            data-pw='tag-item-link'
            content={
              objectType === 'post'
                ? {
                    text: objectData.title ?? '',
                    declared_language: objectData.declared_language,
                    lingua_rs_detected_language: objectData.lingua_rs_detected_language,
                  }
                : null
            }
            fallback={entityName}
          />
          {typeLabel && (
            <Badge
              variant='secondary'
              className='text-xs'
              data-pw='tag-item-type-badge'
            >
              {typeLabel}
            </Badge>
          )}
        </>
      )}
    </div>
  )
}
