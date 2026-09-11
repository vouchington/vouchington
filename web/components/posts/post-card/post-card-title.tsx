import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Post } from '@/types/posts'
import { PostContentText } from '@/components/posts/post-content-text'
import { humanizePostType } from '@ts-shared/utils/format'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowerShareActions = dynamic(() =>
  import('@/components/shared/follower-share-actions').then(mod => mod.FollowerShareActions),
)

export function PostCardTitle({
  ownerUserId,
  post,
  routePath,
  view,
  shareable,
  hideBookmarkActions = false,
}: {
  ownerUserId?: string | null
  post: Post
  routePath: string
  view: 'card' | 'compact'
  shareable: boolean
  hideBookmarkActions?: boolean
}) {
  const trimmedTitle = post.title?.trim()
  const hasAuthoredTitle = Boolean(trimmedTitle)
  const title = hasAuthoredTitle ? trimmedTitle : `Untitled ${humanizePostType(post.post_type)}`
  const shareActions = (
    <FollowerShareActions
      entityType='post'
      entityId={post.slug ?? post.id}
      ownerUserId={ownerUserId}
      hidden={!shareable}
      compact
    />
  )
  if (view === 'card') {
    return (
      <div className='relative z-10'>
        <Link
          prefetch={false}
          href={`/${routePath}/${post.id}`}
          className='block after:absolute after:inset-0 after:z-0 after:content-[""] hover:underline'
          data-pw='post-card-title-link'
        >
          <PostContentText
            as='h3'
            className={`text-base font-semibold leading-snug${shareable ? ' pr-14' : ''}`}
            content={
              hasAuthoredTitle
                ? {
                    text: trimmedTitle,
                    declared_language: post.declared_language,
                    lingua_rs_detected_language: post.lingua_rs_detected_language,
                  }
                : null
            }
            fallback={title}
          />
        </Link>
      </div>
    )
  }
  return (
    <div className='relative z-10 flex items-start justify-between gap-2'>
      <Link
        prefetch={false}
        href={`/${routePath}/${post.id}`}
        className='block after:absolute after:inset-0 after:z-0 after:content-[""] hover:underline'
      >
        <PostContentText
          as='h3'
          className='text-base font-semibold leading-snug'
          content={
            hasAuthoredTitle
              ? {
                  text: trimmedTitle,
                  declared_language: post.declared_language,
                  lingua_rs_detected_language: post.lingua_rs_detected_language,
                }
              : null
          }
          fallback={title}
        />
      </Link>
      {!hideBookmarkActions && <div className='relative z-20 shrink-0'>{shareActions}</div>}
    </div>
  )
}
