'use client'

import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { PostAutocomplete } from '@/components/posts/post-autocomplete'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { fetchCommunities } from '@/lib/api/client/communities'
import { communityHref } from '@/lib/links/entity-href'
import type { CommunityRelationItem } from '@/types/api-responses/communities'
import type { CopyrightEmailApprovalTarget } from './copyright-email-approval-model'

export function CopyrightEmailApprovalOwnerPicker({
  target,
  onPost,
  onTopic,
  onUser,
  onOwner,
}: {
  target: CopyrightEmailApprovalTarget
  onPost: (id: string, title: string) => void
  onTopic: (id: string, name: string) => void
  onUser: (id: string) => void
  onOwner: (key: 'user_id' | 'community_id', id: string, label: string, pathname: string) => void
}) {
  if (target.surface === 'post-image')
    return (
      <PostAutocomplete
        key={`${target.id}:${target.surface}`}
        label='Post'
        value={target.post_id || null}
        onChange={onPost}
      />
    )
  if (target.surface === 'user-profile-image' || target.surface === 'user-profile-link-image')
    return (
      <UserAutocomplete
        key={`${target.id}:${target.surface}`}
        label='User'
        value={target.user_id || null}
        onChange={onUser}
        clearOnTextEdit
      />
    )
  if (target.surface === 'topic-logo-image' || target.surface === 'topic-hero-image')
    return (
      <TopicAutocomplete
        key={`${target.id}:${target.surface}`}
        label='Topic'
        value={target.topic_id || null}
        onChange={onTopic}
        clearOnTextEdit
      />
    )
  if (target.surface === 'community-profile-image' || target.surface === 'community-banner-image')
    return (
      <EntityAutocomplete<CommunityRelationItem>
        key={`${target.id}:${target.surface}`}
        ariaLabel='Search communities'
        emptyText='No communities found'
        getKey={community => community.id}
        onSelect={(community, { setQuery }) => {
          onOwner('community_id', community.id, community.slug, communityHref(community))
          setQuery(community.slug)
        }}
        placeholder='Search communities'
        renderItem={community => community.name}
        search={async (query, signal) =>
          Object.values((await fetchCommunities({ q: query, limit: 10, signal })).communities)
        }
      />
    )
  return null
}
