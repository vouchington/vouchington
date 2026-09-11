import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import { isSlug, isUUID, isUsername } from '@modules/utils'
import {
  entityCacheBloomFilters,
  entityCacheBloomFilterEnabled,
} from '@services/entity-cache/backfill-bloom-filter'
import { getTopicByAny } from '@services/topics/get'
import { getTopicByName, topicNameExists, topicSlugExists } from '@services/topics/get-by-name'
import { getCommunityBySlugOnly } from '@services/communities/get'
import { getPostByAny, postSlugExists } from '@services/posts/get'
import { getPublicUserByAny } from '@services/users/get'
import type { Topic } from '@services/topics/types'

export type AvailabilityKind =
  | 'topic-slug'
  | 'topic-name'
  | 'community-slug'
  | 'post-slug'
  | 'username'

export type TopicConflict = {
  kind: 'topic'
  id: string
  slug: string
  name: string
  topic_type: string
}
export type CommunityConflict = { kind: 'community'; id: string; slug: string; name: string }
export type PostConflict = {
  kind: 'post'
  id: string
  slug: string
  title: string
  post_type: string
}
export type AvailabilityConflict = TopicConflict | CommunityConflict | PostConflict

export type AvailabilityResult = {
  available: boolean
  conflict: AvailabilityConflict | null
}

export const MAX_VALUE_LENGTH = 300
// Mirrors the topics table CHECK constraint char_length(name) <= 255.
const MAX_TOPIC_NAME_LENGTH = 255

type EntityFilter = keyof typeof entityCacheBloomFilters

// Returns true only when the bloom filter is enabled (production) AND reports a definite miss.
// A bloom `false` has no false negatives, so it is authoritative — skip the DB confirm.
// When the filter is disabled (tests) or returns true/null, callers must confirm against the DB.
async function bloomDefinitelyMisses(filter: EntityFilter, normalized: string): Promise<boolean> {
  if (!entityCacheBloomFilterEnabled()) return false
  return (await entityCacheBloomFilters[filter].exists(normalized)) === false
}

export async function checkAvailability(
  kind: AvailabilityKind,
  value: string,
): Promise<AvailabilityResult> {
  assert(value && value.trim().length > 0, 422, 'Value is required')
  assert(value.length <= MAX_VALUE_LENGTH, 422, 'Value too long')

  const trimmed = value.trim()

  switch (kind) {
    case 'topic-slug': {
      if (!isSlug(trimmed)) return { available: true, conflict: null }
      if (await bloomDefinitelyMisses('topics', normalizeKey(trimmed)))
        return { available: true, conflict: null }
      // getTopicByAny resolves an active topic by slug OR alias, so a slug equal to an existing
      // alias is correctly reported as taken (creating it would hijack the alias route).
      const topic = await getTopicByAny(trimmed)
      if (topic) return { available: false, conflict: topicConflict(topic) }
      // Not active: idx_topics__slug is non-partial, so a deleted/merged topic still reserves it.
      if (await topicSlugExists(trimmed)) return { available: false, conflict: null }
      return { available: true, conflict: null }
    }
    case 'topic-name': {
      // The topics table enforces char_length(name) <= 255; a longer name fails create, so
      // treat it as available here (the form's submit-time validation surfaces the error).
      if (trimmed.length > MAX_TOPIC_NAME_LENGTH) return { available: true, conflict: null }
      // Topic name is NOT in the bloom filter — direct DB lookup. Active topic → linkable conflict.
      const topic = await getTopicByName(trimmed)
      if (topic) return { available: false, conflict: topicConflict(topic) }
      // idx_topics__name is non-partial: a deleted/merged topic reserves the name but has no live
      // page, so report it taken without a (broken) link.
      if (await topicNameExists(trimmed)) return { available: false, conflict: null }
      return { available: true, conflict: null }
    }
    case 'community-slug': {
      if (!isSlug(trimmed)) return { available: true, conflict: null }
      if (await bloomDefinitelyMisses('communities', normalizeKey(trimmed)))
        return { available: true, conflict: null }
      const community = await getCommunityBySlugOnly(trimmed)
      if (!community) return { available: true, conflict: null }
      // Only expose name/link for public communities — private community existence is not public
      const communityConflict =
        community.visibility === 'public'
          ? ({
              kind: 'community',
              id: community.id,
              slug: community.slug,
              name: community.name,
            } as const)
          : null
      return { available: false, conflict: communityConflict }
    }
    case 'post-slug': {
      // isSlug accepts UUID-shaped strings, but getPostByAny routes UUIDs to the ID branch and
      // createPostSlug rejects UUID-shaped slugs — treat them as available (the form rejects them).
      if (!isSlug(trimmed) || isUUID(trimmed)) return { available: true, conflict: null }
      if (await bloomDefinitelyMisses('posts', normalizeKey(trimmed)))
        return { available: true, conflict: null }
      // Common path first: an active post with this slug is the conflict (one query).
      const post = await getPostByAny(trimmed)
      if (!post) {
        // Not active: post_slugs keeps the slug (PK) even for deleted posts, which still reserves it.
        if (await postSlugExists(trimmed)) return { available: false, conflict: null }
        return { available: true, conflict: null }
      }
      return {
        available: false,
        conflict: {
          kind: 'post',
          id: post.id,
          slug: post.slug ?? trimmed,
          title: post.title,
          post_type: post.post_type,
        },
      }
    }
    case 'username': {
      if (!isUsername(trimmed)) return { available: true, conflict: null }
      if (await bloomDefinitelyMisses('users', normalizeKey(trimmed)))
        return { available: true, conflict: null }
      const user = await getPublicUserByAny(trimmed)
      if (!user) return { available: true, conflict: null }
      // Per spec: no link for username, just available: false
      return { available: false, conflict: null }
    }
    default:
      assert(false, 422, `Unknown kind: ${kind as string}`)
  }
}

function topicConflict(topic: Pick<Topic, 'id' | 'slug' | 'name' | 'topic_type'>): TopicConflict {
  return {
    kind: 'topic',
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    topic_type: topic.topic_type,
  }
}
