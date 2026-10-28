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

export function ModlogFilters({ community, actor }: { community?: string; actor?: string }) {
  const router = useRouter()
  const selectionRequest = useRef(0)
  useEffect(
    () => () => {
      selectionRequest.current++
    },
    [community, actor],
  )
  function go(nextCommunity?: string, nextActor?: string) {
    selectionRequest.current++
    const params = new URLSearchParams()
    if (nextCommunity) params.set('community', nextCommunity)
    if (nextActor) params.set('actor', nextActor)
    router.push(params.size ? `/admin/modlog?${params}` : '/admin/modlog')
  }
  async function selectActor(id: string) {
    if (!id) return
    const request = ++selectionRequest.current
    try {
      const user = (await fetchUser(id))?.user
      if (request !== selectionRequest.current) return
      if (user?.username) go(community, user.username)
      else
        onError(new Error('Selected account has no username'), {
          fallback: 'This account cannot be used as a user filter.',
        })
    } catch (err) {
      if (request === selectionRequest.current)
        onError(err, { fallback: 'Could not load that user.' })
    }
  }

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      <div className='space-y-1'>
        <EntityAutocomplete<CommunityRelationItem>
          key={community ?? 'all'}
          ariaLabel='Filter by community'
          emptyText='No communities found'
          getKey={item => item.id}
          onSelect={(item, { setQuery }) => {
            setQuery(item.slug)
            go(item.slug, actor)
          }}
          placeholder={community ? `Community: ${community}` : 'Filter by community'}
          renderItem={item => `${item.name} · ${item.slug}`}
          search={async (q, signal) =>
            Object.values((await fetchCommunities({ q, limit: 10, signal })).communities)
          }
        />
        {community && (
          <Button
            type='button'
            variant='ghost'
            onClick={() => go(undefined, actor)}
          >
            Clear community
          </Button>
        )}
      </div>
      <div className='space-y-1'>
        <UserAutocomplete
          key={actor ?? 'all'}
          ariaLabel='Filter by user'
          label={actor ? `@${actor}` : ''}
          value={null}
          onChange={selectActor}
          placeholder={actor ? `User: @${actor}` : 'Filter by user'}
        />
        {actor && (
          <Button
            type='button'
            variant='ghost'
            onClick={() => go(community)}
          >
            Clear user
          </Button>
        )}
      </div>
    </div>
  )
}
