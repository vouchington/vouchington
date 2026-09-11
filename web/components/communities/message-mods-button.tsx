'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { openModmailThread } from '@/lib/api/client/modmail'
import { modmailThreadHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  communitySlug: string
}

export default function MessageModsButton({ communitySlug }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleMessageMods() {
    if (loading) return
    setLoading(true)
    try {
      const { thread } = await openModmailThread(communitySlug)
      router.push(modmailThreadHref(communitySlug, thread))
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.messageModsButton.failedToOpenMessageThreadWith_eeb857ec',
        ),
        tags: { action: 'message-mods', communitySlug },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size='touchSm'
      variant='outline'
      loading={loading}
      disabled={loading}
      onClick={handleMessageMods}
      data-pw='message-mods-button'
    >
      {t('extracted.communities.messageModsButton.messageMods_9b926118')}
    </Button>
  )
}
