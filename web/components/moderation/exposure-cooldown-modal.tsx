'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ExposureCooldownModalProps {
  open: boolean
  cooldownEndsAt: string | null
  onDismiss: () => void
}

/**
 * Mandatory-acknowledge break prompt shown after a moderator reaches the disturbing-media
 * exposure threshold. Displays a countdown timer; the dismiss button is only enabled once
 * the cooldown window elapses.
 */
export function ExposureCooldownModal({
  open,
  cooldownEndsAt,
  onDismiss,
}: ExposureCooldownModalProps) {
  // Store the current timestamp as state so `secondsLeft` can be derived purely at render time
  // without calling Date.now() directly (impure). The interval updates nowMs every second,
  // causing a re-render that recalculates the countdown from the latest stored timestamp.
  const t = useTranslations()
  const [nowMs, setNowMs] = useState(Date.now)

  useEffect(() => {
    if (!open || !cooldownEndsAt) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open, cooldownEndsAt])

  const secondsLeft =
    open && cooldownEndsAt
      ? Math.max(0, Math.ceil((new Date(cooldownEndsAt).getTime() - nowMs) / 1000))
      : null

  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null
  const seconds = secondsLeft !== null ? secondsLeft % 60 : null
  const countdownLabel =
    minutes !== null && seconds !== null
      ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : null

  const canDismiss = secondsLeft !== null && secondsLeft <= 0

  return (
    <Dialog
      open={open}
      modal={false}
    >
      <DialogContent
        className='bottom-4 left-auto right-4 top-auto translate-x-0 translate-y-0 sm:max-w-md'
        data-pw='exposure-cooldown-modal'
        hideCloseButton
        hideOverlay
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('extracted.moderation.exposureCooldownModal.takeABreak_b4ea6df7')}
          </DialogTitle>
          <DialogDescription>
            {t('extracted.moderation.exposureCooldownModal.youVeReviewedSeveralPiecesOf_cf88040b')}
          </DialogDescription>
        </DialogHeader>

        {countdownLabel !== null && (
          <p
            className='text-center font-mono text-2xl font-semibold'
            data-pw='cooldown-countdown'
          >
            {countdownLabel}
          </p>
        )}

        <p className='text-center text-sm text-muted-foreground'>
          {t('extracted.moderation.exposureCooldownModal.stepAwayTakeABreathThe_8fe02e8a')}
        </p>

        <DialogFooter>
          <Button
            onClick={onDismiss}
            disabled={!canDismiss}
            data-pw='cooldown-dismiss'
          >
            {canDismiss ? 'I understand, continue' : 'Please wait…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
