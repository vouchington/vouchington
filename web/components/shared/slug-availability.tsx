'use client'

import Link from 'next/link'
import type { AvailabilityKind, AvailabilityConflict } from '@/lib/api/client/availability'
import type { PostType } from '@/types/posts'
import type { AvailabilityState } from '@/hooks/use-availability-check'
import { AvailabilityIndicator } from '@/components/ui/availability-indicator'
import { topicHref, communityHref } from '@/lib/links/entity-href'
import { getCanonicalPostPath } from '@/lib/post-helpers'

function ConflictLink({ conflict }: { conflict: AvailabilityConflict }) {
  switch (conflict.kind) {
    case 'topic': {
      const href = topicHref({
        topic_type: conflict.topic_type,
        slug: conflict.slug,
        id: conflict.id,
      })
      return (
        <Link
          href={href}
          className='underline underline-offset-2'
        >
          {conflict.name}
        </Link>
      )
    }
    case 'community': {
      const href = communityHref({ slug: conflict.slug })
      return (
        <Link
          href={href}
          className='underline underline-offset-2'
        >
          {conflict.name}
        </Link>
      )
    }
    case 'post': {
      const href = getCanonicalPostPath({ ...conflict, post_type: conflict.post_type as PostType })
      return (
        <Link
          href={href}
          className='underline underline-offset-2'
        >
          {conflict.title || conflict.slug}
        </Link>
      )
    }
  }
}

function labelForKind(kind: AvailabilityKind): string {
  switch (kind) {
    case 'topic-slug': {
      return 'topic slug'
    }
    case 'topic-name': {
      return 'topic name'
    }
    case 'community-slug': {
      return 'community slug'
    }
    case 'post-slug': {
      return 'post slug'
    }
    case 'username': {
      return 'username'
    }
  }
}

interface Props {
  kind: AvailabilityKind
  state: AvailabilityState
}

export function SlugAvailability({ kind, state }: Props) {
  const label = labelForKind(kind)
  const conflictNode = state.conflict ? <ConflictLink conflict={state.conflict} /> : null

  return (
    <AvailabilityIndicator
      status={state.status}
      label={label}
      conflict={conflictNode}
    />
  )
}
