import type { ReactNode } from 'react'
import { TagList } from './tag-list'
import { Card } from '@/components/ui/card'
import type { Topic } from '@/types/topics'
import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { ManageTagsDialog } from './manage-tags-dialog'
import { PaginatedEntityTagList } from './paginated-entity-tag-list'

type AsidePw = 'topic-faq-posts-aside' | 'topic-related-topics-aside'
type HeadingPw = 'topic-faq-posts-heading' | 'topic-related-topics-heading'
type TopicRelationObjectType = 'post' | 'topic'
type TopicRelationPredicate = 'faq' | 'related'

interface TopicRelationAsideCardProps {
  topic: Topic
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting: boolean
  isAuthenticated?: boolean
  t: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
  asidePw: AsidePw
  headingPw: HeadingPw
  heading: string
  predicate: TopicRelationPredicate
  objectType: TopicRelationObjectType
  manageHref: string
  manageLabel: string
}

function AsideCard({ asidePw, children }: { asidePw: AsidePw; children: ReactNode }) {
  if (asidePw === 'topic-faq-posts-aside') {
    return (
      <Card
        className='p-4'
        data-pw='topic-faq-posts-aside'
      >
        {children}
      </Card>
    )
  }
  return (
    <Card
      className='p-4'
      data-pw='topic-related-topics-aside'
    >
      {children}
    </Card>
  )
}

function AsideHeading({ headingPw, heading }: { headingPw: HeadingPw; heading: string }) {
  if (headingPw === 'topic-faq-posts-heading') {
    return (
      <h3
        className='text-sm font-semibold'
        data-pw='topic-faq-posts-heading'
      >
        {heading}
      </h3>
    )
  }
  return (
    <h3
      className='text-sm font-semibold'
      data-pw='topic-related-topics-heading'
    >
      {heading}
    </h3>
  )
}

export function TopicRelationAsideCard({
  topic,
  relations,
  electionVotes,
  showManageButton,
  showVoting,
  isAuthenticated = false,
  t,
  response,
  asidePw,
  headingPw,
  heading,
  predicate,
  objectType,
  manageHref,
  manageLabel,
}: TopicRelationAsideCardProps) {
  return (
    <AsideCard asidePw={asidePw}>
      <div className='mb-3 flex items-center justify-between'>
        <AsideHeading
          headingPw={headingPw}
          heading={heading}
        />
        {showManageButton && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate={predicate}
            objectType={objectType}
            label={heading}
            heading={heading}
            dialogTitle={manageLabel}
            triggerLabel={manageLabel}
            manageHref={manageHref}
            loadingText={t('extracted.tags.manageTagsDialog.loading_47d2a515')}
            errorText={t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {response ? (
        <PaginatedEntityTagList
          entityType='topic'
          entityId={topic.id}
          predicate={predicate}
          objectType={objectType}
          initialData={response}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType={objectType}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
        />
      )}
    </AsideCard>
  )
}
