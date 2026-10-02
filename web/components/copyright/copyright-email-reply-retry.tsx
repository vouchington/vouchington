'use client'

import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import {
  listCopyrightEmailIntakes,
  replayCopyrightEmailIntakeReply,
} from '@/lib/api/client/copyright-email-intakes'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import { copyrightEmailActionError } from './copyright-email-review-decision'

/**
 * Puts the failed reply to a declined email intake back in the delivery queue after staff confirm.
 * The server resends the exact stored text and records who retried it, so the dialog only has to
 * say that. Both outcomes refresh the queue: a retried reply drops out of it, and so does one
 * another reviewer already retried.
 */
export function CopyrightEmailReplyRetry({
  intakeId,
  disabled,
  resetQueue,
  setError,
  setSuccess,
}: {
  intakeId: string
  disabled: boolean
  resetQueue: (page: CopyrightEmailIntakeQueuePage) => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
}) {
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setError(null)
    setSuccess(null)
    setRetrying(true)
    try {
      const { replayed } = await replayCopyrightEmailIntakeReply(intakeId)
      resetQueue(await listCopyrightEmailIntakes())
      setSuccess(
        replayed
          ? 'The reply will be sent again to the original sender.'
          : 'That reply was no longer waiting to be retried.',
      )
    } catch (error) {
      setError(copyrightEmailActionError(error, 'We could not retry that reply.'))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          disabled={disabled || retrying}
          size='sm'
          variant='outline'
        >
          Retry reply
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send this reply again?</AlertDialogTitle>
          <AlertDialogDescription>
            The reply is sent again to the same sender, word for word as it was first written. The
            retry is recorded under your name.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={retry}>Send reply again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
