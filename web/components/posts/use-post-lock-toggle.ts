'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import onError from '@/lib/on-error'
import { lockPost, unlockPost } from '@/lib/api/client/posts-lock'
import { useTranslations } from '@/lib/i18n/use-translations'

export function usePostLockToggle({
  postIdOrSlug,
  lockedAt,
}: {
  postIdOrSlug: string
  lockedAt: string | null | undefined
}) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const lockKey = `${postIdOrSlug}:${lockedAt ?? ''}`
  const [lockState, setLockState] = useState(() => ({
    key: lockKey,
    isLocked: lockedAt != null,
  }))
  const [isPending, setIsPending] = useState(false)
  const isLocked = lockState.key === lockKey ? lockState.isLocked : lockedAt != null

  const handleToggle = async () => {
    if (isPending) return
    const next = !isLocked
    setLockState({ key: lockKey, isLocked: next })
    setIsPending(true)
    try {
      if (next) await lockPost(postIdOrSlug)
      else await unlockPost(postIdOrSlug)
      refresh()
    } catch (error) {
      setLockState({ key: lockKey, isLocked: !next })
      onError(error, {
        fallback: next
          ? t('extracted.posts.postLockButton.failedToLockThreadPleaseTry_005f2152')
          : t('extracted.posts.postLockButton.failedToUnlockThreadPleaseTry_a7aaf9cf'),
        tags: { form: 'post-lock' },
      })
    } finally {
      setIsPending(false)
    }
  }

  const label = isLocked
    ? t('extracted.posts.postLockButton.unlock_4ac709aa')
    : t('extracted.posts.postLockButton.lock_db44b8db')
  const tooltip = isLocked
    ? t('extracted.posts.postLockButton.allowNewRepliesToThisThread_030b2453')
    : t('extracted.posts.postLockButton.preventNewRepliesToThisThread_bc24df3d')
  return { isLocked, isPending, label, tooltip, handleToggle }
}
