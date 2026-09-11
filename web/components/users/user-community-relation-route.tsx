import { notFound } from 'next/navigation'
import { getUserCommunitiesCollection } from '@/lib/api/server'
import { EmptyState } from '@/components/shared/empty-state'
import { CommunityCard } from '@/components/communities/community-card'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getOwnerRelationAction } from './user-relation-owner-action'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export async function UserCommunityRelationRoute({
  idOrUsername,
  listType,
  relationAction,
}: {
  idOrUsername: string
  listType: 'saved' | 'proxy-following' | 'proxy-muted'
  relationAction: RelationManagementActionConfig
}) {
  const t = await getTranslations()
  const communitiesData = await getUserCommunitiesCollection(idOrUsername, listType)
  if (!communitiesData) notFound()

  const ownerRelationAction = await getOwnerRelationAction(idOrUsername, relationAction)

  if (communitiesData.results.length === 0) {
    return (
      <EmptyState
        title={t('extracted.users.userCommunityRelationRoute.noListtypeCommunities_0ef91248', {
          listType: listType.replace('-', ' '),
        })}
        description={t(
          'extracted.users.userCommunityRelationRoute.thereAreNoListtypeCommunitiesTo_fb837841',
          { listType: listType.replace('-', ' ') },
        )}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {communitiesData.results.map(community => (
        <div key={community.id}>
          <CommunityCard
            community={community}
            hideJoinButton
          />
          {ownerRelationAction ? (
            <div className='mt-2'>
              <RelationManagementAction
                entityId={community.id}
                config={ownerRelationAction}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
