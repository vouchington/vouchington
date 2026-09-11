'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createHostname } from '@/lib/api/client/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  isAdmin?: boolean
}

export function BlockHostnameQuickAdd({ isAdmin }: Props) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [hostname, setHostname] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isBusy = isSubmitting || isPending

  if (!isAdmin) return null

  function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault()
    const trimmed = hostname.trim()
    if (!trimmed) return
    setDialogOpen(true)
  }

  async function handleConfirm() {
    const trimmed = hostname.trim()
    if (!trimmed || isBusy) return
    setIsSubmitting(true)
    try {
      await createHostname({ hostname: trimmed, blocked: true })
      setHostname('')
      startTransition(() => refresh())
      toast.success(
        t('extracted.domains.blockHostnameQuickAdd.hostnameHasBeenBlocked_33f77377', {
          hostname: trimmed,
        }),
      )
    } catch {
      toast.error(t('extracted.domains.blockHostnameQuickAdd.failedToBlockHostname_116bcd98'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <form
        data-pw='block-hostname-quick-add'
        onSubmit={handleSubmit}
        className='flex flex-wrap gap-3'
      >
        <Input
          aria-label={t('extracted.domains.blockHostnameQuickAdd.hostnameToBlock_9e5a5d41')}
          type='text'
          value={hostname}
          onChange={e => setHostname(e.target.value)}
          placeholder={t('extracted.domains.blockHostnameQuickAdd.exampleCom_a379a6f6')}
          className='min-w-40 flex-1'
          disabled={isBusy}
        />
        <Button
          type='submit'
          variant='destructive'
          disabled={isBusy || !hostname.trim()}
        >
          {t('extracted.domains.blockHostnameQuickAdd.blockHostname_60473140')}
        </Button>
      </form>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.domains.blockHostnameQuickAdd.blockHostname_176e91d9', {
                hostname: hostname.trim(),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'extracted.domains.blockHostnameQuickAdd.blockingWillSoftDeleteAllEntity_ffea2488',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>
              {t('extracted.domains.blockHostnameQuickAdd.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isBusy}
              onClick={handleConfirm}
            >
              {isBusy
                ? t('extracted.domains.blockHostnameQuickAdd.blocking_c156afd1')
                : t('extracted.domains.blockHostnameQuickAdd.blockHostname_60473140')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
