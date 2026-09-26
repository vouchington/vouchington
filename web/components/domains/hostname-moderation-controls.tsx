'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { updateHostname } from '@/lib/api/client/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  hostnameId: string
  blocked: boolean | null | undefined
  crawlable: boolean | null | undefined
  linkRelFollow: boolean | null | undefined
}

export function HostnameModerationControls({
  hostnameId,
  blocked,
  crawlable,
  linkRelFollow,
}: Props) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)
  const [isBlocked, setIsBlocked] = useState(blocked === true)
  const [isCrawlable, setIsCrawlable] = useState(crawlable === true)
  const [isLinkFollow, setIsLinkFollow] = useState(linkRelFollow === true)
  const isBusy = isSubmitting || isPending

  async function handleToggle(field: 'crawlable' | 'link_rel_follow', value: boolean) {
    if (isBusy) return
    setIsSubmitting(true)
    try {
      await updateHostname(hostnameId, { [field]: value })
      if (field === 'crawlable') setIsCrawlable(value)
      else setIsLinkFollow(value)
      startTransition(() => refresh())
      toast.success(t('extracted.domains.hostnameModerationControls.hostnameUpdated_f8ec2f41'))
    } catch {
      toast.error(t('extracted.domains.hostnameModerationControls.failedToUpdateHostname_b1f39348'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleBlock(value: boolean) {
    if (isBusy) return
    setIsSubmitting(true)
    try {
      await updateHostname(hostnameId, { blocked: value })
      setIsBlocked(value)
      startTransition(() => refresh())
      toast.success(
        value
          ? t('extracted.domains.hostnameModerationControls.hostnameBlocked_51bbbc21')
          : t('extracted.domains.hostnameModerationControls.hostnameUnblocked_74158cff'),
      )
    } catch {
      toast.error(t('extracted.domains.hostnameModerationControls.failedToUpdateHostname_b1f39348'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      data-pw='hostname-moderation-controls'
      className='rounded-md border bg-card'
    >
      <dl className='divide-y'>
        <div className='flex items-center justify-between px-4 py-3 text-sm'>
          <dt className='font-medium text-muted-foreground'>
            {t('extracted.domains.hostnameModerationControls.blocked_18f2a094')}
          </dt>
          <dd className='flex items-center gap-2'>
            <AlertDialog
              open={isBlockDialogOpen}
              onOpenChange={setIsBlockDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Switch
                  data-pw='hostname-blocked-switch'
                  checked={isBlocked}
                  disabled={isBusy}
                  aria-label={t('extracted.domains.hostnameModerationControls.blocked_18f2a094')}
                />
              </AlertDialogTrigger>
              <AlertDialogContent>
                {isBlocked ? (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t(
                          'extracted.domains.hostnameModerationControls.unblockThisHostname_373a1c75',
                        )}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          'extracted.domains.hostnameModerationControls.thisWillUnblockTheHostnameExisting_97d65661',
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('extracted.domains.hostnameModerationControls.cancel_19766ed6')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleBlock(false)}>
                        {t('extracted.domains.hostnameModerationControls.unblock_712da631')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                ) : (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t(
                          'extracted.domains.hostnameModerationControls.blockThisHostname_06d3046e',
                        )}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          'extracted.domains.hostnameModerationControls.blockingWillSoftDeleteAllEntity_ffea2488',
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('extracted.domains.hostnameModerationControls.cancel_19766ed6')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        onClick={() => handleBlock(true)}
                      >
                        {t('extracted.domains.hostnameModerationControls.blockHostname_60473140')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                )}
              </AlertDialogContent>
            </AlertDialog>
          </dd>
        </div>
        <div className='flex items-center justify-between px-4 py-3 text-sm'>
          <dt className='font-medium text-muted-foreground'>
            {t('extracted.domains.hostnameModerationControls.crawlable_8e55a03f')}
          </dt>
          <dd>
            <Switch
              data-pw='hostname-crawlable-switch'
              checked={isCrawlable}
              disabled={isBusy}
              onCheckedChange={v => handleToggle('crawlable', v)}
              aria-label={t('extracted.domains.hostnameModerationControls.crawlable_8e55a03f')}
            />
          </dd>
        </div>
        <div className='flex items-center justify-between px-4 py-3 text-sm'>
          <dt className='font-medium text-muted-foreground'>
            {t('extracted.domains.hostnameModerationControls.linkRelFollow_da993ba6')}
          </dt>
          <dd>
            <Switch
              data-pw='hostname-link-rel-follow-switch'
              checked={isLinkFollow}
              disabled={isBusy}
              onCheckedChange={v => handleToggle('link_rel_follow', v)}
              aria-label={t('extracted.domains.hostnameModerationControls.linkRelFollow_da993ba6')}
            />
          </dd>
        </div>
      </dl>
    </div>
  )
}
