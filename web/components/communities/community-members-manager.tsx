'use client'

import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type {
  Community,
  CommunityMember,
  CommunityMembersResponseBody,
} from '@/types/api-responses'
import { CommunityMemberRow } from './community-member-row'
import { useCommunityMembersManager } from './use-community-members-manager'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  community: Community
  currentUserMembership: CommunityMember | null | undefined
  data: CommunityMembersResponseBody
}

export function CommunityMembersManager({ community, currentUserMembership, data }: Props) {
  const t = useTranslations()
  const state = useCommunityMembersManager({ community, currentUserMembership, data })

  return (
    <div className='space-y-4'>
      <h2 className='text-xl font-semibold'>
        {t('extracted.communities.communityMembersManager.membersCount_b449ad91', {
          count: state.hasNextPage ? `${state.members.length}+` : state.members.length,
        })}
      </h2>
      {state.error && (
        <div className='rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive'>
          {state.error}
        </div>
      )}
      {state.members.length === 0 && !state.hasNextPage ? (
        <EmptyState
          icon='search'
          title={t('extracted.communities.communityMembersManager.noMembersYet_669a52e9')}
          description={t(
            'extracted.communities.communityMembersManager.membersOfThisCommunityWillBe_ce11c715',
          )}
          className='rounded-md border bg-card p-4'
        />
      ) : (
        <InfiniteScroll
          hasNextPage={state.hasNextPage}
          endCursor={state.endCursor}
          onLoadMore={state.handleLoadMore}
          loadingMore={state.loadingMore}
          fetchError={state.fetchError}
          clearError={state.clearError}
          resetKey={state.resetKey}
        >
          <div className='space-y-2'>
            {state.members.map(member => (
              <CommunityMemberRow
                key={member.id}
                community={community}
                currentUserMembership={currentUserMembership}
                isOwner={state.isOwner}
                member={member}
                state={state}
              />
            ))}
          </div>
        </InfiniteScroll>
      )}
    </div>
  )
}
