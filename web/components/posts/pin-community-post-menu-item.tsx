'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pin, PinOff } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { fetchCommunityPinnedPosts, setCommunityPinnedPosts } from '@/lib/api/client/communities'
import { MAX_PINS } from '@/lib/communities/pinned-posts'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PinCommunityPostMenuItemProps {
  postId: string
  communitySlug: string
  isPinned: boolean
}

export function PinCommunityPostMenuItem({
  postId,
  communitySlug,
  isPinned,
}: PinCommunityPostMenuItemProps) {
  const t = useTranslations()
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    setPending(true)
    try {
      const current = await fetchCommunityPinnedPosts(communitySlug)
      const currentIds = (current?.pinned_posts ?? []).map((p: { post_id: string }) => p.post_id)

      if (isPinned) {
        await setCommunityPinnedPosts(
          communitySlug,
          currentIds.filter((id: string) => id !== postId),
        )
        toast.success(
          t('extracted.posts.pinCommunityPostMenuItem.postUnpinnedFromCommunity_4aa246d6'),
        )
        router.refresh()
      } else {
        if (currentIds.includes(postId)) {
          toast.success(
            t('extracted.posts.pinCommunityPostMenuItem.postPinnedToCommunity_28fd63df'),
          )
          router.refresh()
          return
        }
        if (currentIds.length >= MAX_PINS) {
          toast.error(
            t('extracted.posts.pinCommunityPostMenuItem.youCanPinAtMostMaxpins_7b418670', {
              maxPins: MAX_PINS,
            }),
          )
          return
        }
        await setCommunityPinnedPosts(communitySlug, [...currentIds, postId])
        toast.success(t('extracted.posts.pinCommunityPostMenuItem.postPinnedToCommunity_28fd63df'))
        router.refresh()
      }
    } catch {
      toast.error(t('extracted.posts.pinCommunityPostMenuItem.failedToUpdatePinnedPosts_b841af5f'))
    } finally {
      setPending(false)
    }
  }

  if (isPinned) {
    return (
      <DropdownMenuItem
        onSelect={e => {
          e.preventDefault()
          void handleToggle()
        }}
        disabled={pending}
        data-pw='unpin-community-post-menu-item'
      >
        <PinOff className='h-4 w-4' />
        {t('extracted.posts.pinCommunityPostMenuItem.unpinFromCommunity_b75c12d5')}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem
      onSelect={e => {
        e.preventDefault()
        void handleToggle()
      }}
      disabled={pending}
      data-pw='pin-community-post-menu-item'
    >
      <Pin className='h-4 w-4' />
      {t('extracted.posts.pinCommunityPostMenuItem.pinToCommunity_49a112f6')}
    </DropdownMenuItem>
  )
}
