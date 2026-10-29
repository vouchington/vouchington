'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { fetchCommunities } from '@/lib/api/client/communities'
import type { CommunityRelationItem } from '@/types/api-responses/communities'
import { fetchUser } from '@/lib/api/client/users'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ModlogFilters({
  community,
  actor,
  communityId,
  actorId,
}: {
  community?: string
  actor?: string
  communityId?: string
  actorId?: string
}) {
  const t = useTranslations()
  const filters = { community, actor, community_id: communityId, actor_user_id: actorId }
  const router = useRouter()
  const selectionRequest = useRef(0)
  useEffect(
    () => () => {
      selectionRequest.current++
    },
    [community, actor, communityId, actorId],
  )
  function go(changes: Partial<typeof filters>) {
    selectionRequest.current++
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...filters, ...changes }))
      if (value) params.set(key, value)
    router.push(params.size ? `/admin/modlog?${params}` : '/admin/modlog')
  }
  async function selectActor(id: string) {
    if (!id) return
    const request = ++selectionRequest.current
    try {
      const user = (await fetchUser(id))?.user
      if (request !== selectionRequest.current) return
      if (user?.username) go({ actor: user.username, actor_user_id: undefined })
      else
        onError(new Error(t('extracted.admin.modlogFilters.selectedAccountHasNoUsername')), {
          fallback: t('extracted.admin.modlogFilters.accountCannotBeUsedAsUserFilter'),
        })
    } catch (err) {
      if (request === selectionRequest.current)
        onError(err, { fallback: t('extracted.admin.modlogFilters.couldNotLoadUser') })
    }
  }

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      <div className='space-y-1'>
        <EntityAutocomplete<CommunityRelationItem>
          key={community ?? communityId ?? 'all'}
          queryLabel={communityId ? t('extracted.admin.modlogFilters.deletedCommunity') : undefined}
          ariaLabel={t('extracted.admin.modlogFilters.filterByCommunity')}
          emptyText={t('extracted.communities.communityList.noCommunitiesFound_1875e081')}
          getKey={item => item.id}
          onSelect={(item, { setQuery }) => {
            setQuery(item.slug)
            go({ community: item.slug, community_id: undefined })
          }}
          placeholder={
            community
              ? t('extracted.admin.modlogFilters.community', { community })
              : t('extracted.admin.modlogFilters.filterByCommunity')
          }
          renderItem={item => `${item.name} · ${item.slug}`}
          search={async (q, signal) =>
            Object.values((await fetchCommunities({ q, limit: 10, signal })).communities)
          }
        />
        {(community || communityId) && (
          <Button
            type='button'
            variant='ghost'
            onClick={() => go({ community: undefined, community_id: undefined })}
          >
            {t('extracted.admin.modlogFilters.clearCommunity')}
          </Button>
        )}
      </div>
      <div className='space-y-1'>
        <UserAutocomplete
          key={actor ?? actorId ?? 'all'}
          ariaLabel={t('extracted.admin.modlogFilters.filterByUser')}
          label={
            actor
              ? `@${actor}`
              : actorId
                ? t('extracted.communities.communityAgentPromptHistory.deletedUser_152bc3aa')
                : ''
          }
          value={null}
          onChange={selectActor}
          placeholder={
            actor
              ? t('extracted.admin.modlogFilters.user', { username: actor })
              : t('extracted.admin.modlogFilters.filterByUser')
          }
        />
        {(actor || actorId) && (
          <Button
            type='button'
            variant='ghost'
            onClick={() => go({ actor: undefined, actor_user_id: undefined })}
          >
            {t('extracted.admin.modlogFilters.clearUser')}
          </Button>
        )}
      </div>
    </div>
  )
}
