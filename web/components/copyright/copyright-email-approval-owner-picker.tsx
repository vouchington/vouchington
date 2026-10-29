'use client'

import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { PostContentText } from '@/components/posts/post-content-text'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchCommunities } from '@/lib/api/client/communities'
import { useTranslations } from '@/lib/i18n/use-translations'
import { communityHref } from '@/lib/links/entity-href'
import { humanizePostType } from '@ts-shared/utils/format'
import type { CommunityRelationItem } from '@/types/api-responses/communities'
import type { Post } from '@/types/posts'
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
  const t = useTranslations()
  if (target.surface === 'post-image')
    return (
      <EntityAutocomplete<Post>
        key={`${target.id}:${target.surface}`}
        ariaLabel={t('extracted.posts.postAutocomplete.searchPosts_2f810cde')}
        emptyText={t('extracted.posts.postAutocomplete.noPostsFound_0232d174')}
        getKey={post => post.id}
        onSelect={(post, { setQuery }) => {
          onPost(post.id, post.title)
          setQuery(post.title)
        }}
        placeholder={t('extracted.posts.postAutocomplete.searchPosts_015f89cf')}
        renderItem={post => (
          <>
            <PostContentText
              as='span'
              content={{
                text: post.title,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              }}
            />
            <span className='text-xs text-muted-foreground'>
              {humanizePostType(post.post_type)}
            </span>
          </>
        )}
        search={async (query, signal) =>
          Object.values((await fetchPosts({ q: query, limit: 10, signal })).posts ?? {})
        }
      />
    )
  if (target.surface === 'user-profile-image' || target.surface === 'user-profile-link-image')
    return (
      <UserAutocomplete
        key={`${target.id}:${target.surface}`}
        label=''
        value={target.user_id || null}
        onChange={onUser}
        clearOnTextEdit
      />
    )
  if (target.surface === 'topic-logo-image' || target.surface === 'topic-hero-image')
    return (
      <TopicAutocomplete
        key={`${target.id}:${target.surface}`}
        label=''
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
