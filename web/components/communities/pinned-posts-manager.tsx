/* eslint-disable react-doctor/rerender-lazy-state-init */
'use client'

import { useState } from 'react'
import { Pin, ArrowUp, ArrowDown, X, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setCommunityPinnedPosts } from '@/lib/api/client/communities'
import type {
  CommunityPostsResponseBody,
  CommunityPinnedPostsResponseBody,
} from '@/types/api-responses'
import { ApiError } from '@/lib/api/error'
import { MAX_PINS } from '@/lib/communities/pinned-posts'
import { toast } from 'sonner'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'

type PinnedPost = CommunityPinnedPostsResponseBody['pinned_posts'][number]

interface Props {
  communitySlug: string
  posts: CommunityPostsResponseBody
  initialPinnedPosts: PinnedPost[]
}

export function PinnedPostsManager({ communitySlug, posts, initialPinnedPosts }: Props) {
  const t = useTranslations()
  const [pinnedPostIds, setPinnedPostIds] = useState<string[]>(
    initialPinnedPosts.map(p => p.post_id),
  )
  const [isLoading, setIsLoading] = useState(false)

  async function updatePins(newPostIds: string[]) {
    setIsLoading(true)
    try {
      await setCommunityPinnedPosts(communitySlug, newPostIds)
      setPinnedPostIds(newPostIds)
    } catch (error) {
      toast.error(
        t('extracted.communities.pinnedPostsManager.failedToUpdatePinnedPosts_5846d6ad'),
        {
          description:
            error instanceof ApiError
              ? error.message
              : t('extracted.communities.pinnedPostsManager.anErrorOccurred_ddf785b7'),
        },
      )
    } finally {
      setIsLoading(false)
    }
  }

  function moveUp(index: number) {
    if (index === 0) return
    const newIds = [...pinnedPostIds]
    ;[newIds[index - 1], newIds[index]] = [newIds[index]!, newIds[index - 1]!]
    updatePins(newIds).catch(() => undefined)
  }

  function moveDown(index: number) {
    if (index === pinnedPostIds.length - 1) return
    const newIds = [...pinnedPostIds]
    ;[newIds[index], newIds[index + 1]] = [newIds[index + 1]!, newIds[index]!]
    updatePins(newIds).catch(() => undefined)
  }

  function removePin(postId: string) {
    updatePins(pinnedPostIds.filter(id => id !== postId)).catch(() => undefined)
  }

  function addPin(postId: string) {
    if (pinnedPostIds.includes(postId)) return
    updatePins([...pinnedPostIds, postId]).catch(() => undefined)
  }

  /* c8 ignore next -- reformatted by oxfmt; lambda branch not covered in unit tests */
  const pinnedPosts = pinnedPostIds.flatMap(id => (posts.posts[id] ? [posts.posts[id]] : []))

  const pinnedPostIdSet = new Set(pinnedPostIds)
  const availablePosts = posts.results.flatMap(r => {
    const p = posts.posts[r.id]
    return p && !pinnedPostIdSet.has(p.id) ? [p] : []
  })

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('extracted.communities.pinnedPostsManager.pinnedPostsCurrentMax_8d535b58', {
            current: pinnedPostIds.length,
            max: MAX_PINS,
          })}
        </h3>
        {pinnedPosts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.communities.pinnedPostsManager.noPostsPinnedYet_df39d4c2')}
          </p>
        ) : (
          pinnedPosts.map((post, index) => (
            <div
              key={post.id}
              className='flex items-center gap-2 rounded-md border bg-card p-4'
            >
              <Pin className='h-4 w-4 shrink-0 text-muted-foreground' />
              <PostContentText
                as='span'
                className='flex-1 truncate text-sm font-medium'
                content={{
                  text: post.title,
                  declared_language: post.declared_language,
                  lingua_rs_detected_language: post.lingua_rs_detected_language,
                }}
              />
              <div className='flex items-center gap-1'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  disabled={isLoading || index === 0}
                  onClick={() => moveUp(index)}
                  aria-label={t('extracted.communities.pinnedPostsManager.moveUp_c66feb5e')}
                >
                  <ArrowUp className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  disabled={isLoading || index === pinnedPostIds.length - 1}
                  onClick={() => moveDown(index)}
                  aria-label={t('extracted.communities.pinnedPostsManager.moveDown_40bb50da')}
                >
                  <ArrowDown className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  disabled={isLoading}
                  onClick={() => removePin(post.id)}
                  aria-label={t('extracted.communities.pinnedPostsManager.removePin_0197f0d8')}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {pinnedPostIds.length < MAX_PINS && availablePosts.length > 0 && (
        <div className='space-y-3'>
          <h3 className='text-sm font-medium'>
            {t('extracted.communities.pinnedPostsManager.addAPost_8ee7a3a8')}
          </h3>
          <div className='space-y-2'>
            {availablePosts.slice(0, 10).map(post => (
              <div
                key={post.id}
                className='flex items-center gap-2 rounded-md border bg-card p-4'
              >
                <PostContentText
                  as='span'
                  className='flex-1 truncate text-sm'
                  content={{
                    text: post.title,
                    declared_language: post.declared_language,
                    lingua_rs_detected_language: post.lingua_rs_detected_language,
                  }}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  disabled={isLoading}
                  onClick={() => addPin(post.id)}
                  aria-label={t('extracted.communities.pinnedPostsManager.pinPost_9ea3296a')}
                >
                  <PlusCircle className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
