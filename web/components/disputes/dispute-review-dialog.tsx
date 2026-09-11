'use client'

import { useReducer } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import onError from '@/lib/on-error/on-error'
import { createReviewDispute } from '@/lib/api/client/disputes'
import { DisputeForm } from './dispute-form'
import { useTranslations } from '@/lib/i18n/use-translations'

interface State {
  reason: string
  claimText: string
  loading: boolean
  error: string | null
  submitted: boolean
}

type Action =
  | { type: 'set_reason'; value: string }
  | { type: 'set_claim_text'; value: string }
  | { type: 'set_loading'; value: boolean }
  | { type: 'set_error'; value: string | null }
  | { type: 'set_submitted' }
  | { type: 'reset' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_reason': {
      return { ...state, reason: action.value }
    }
    case 'set_claim_text': {
      return { ...state, claimText: action.value }
    }
    case 'set_loading': {
      return { ...state, loading: action.value }
    }
    case 'set_error': {
      return { ...state, error: action.value }
    }
    case 'set_submitted': {
      return { ...state, submitted: true }
    }
    case 'reset': {
      return { reason: '', claimText: '', loading: false, error: null, submitted: false }
    }
  }
}

interface DisputeReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  topicId: string
}

export function DisputeReviewDialog({
  open,
  onOpenChange,
  postId,
  topicId,
}: DisputeReviewDialogProps) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, {
    reason: '',
    claimText: '',
    loading: false,
    error: null,
    submitted: false,
  })
  const turnstile = useTurnstileToken()

  async function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault()
    if (!state.reason || !state.claimText.trim()) return
    dispatch({ type: 'set_loading', value: true })
    dispatch({ type: 'set_error', value: null })
    try {
      await createReviewDispute({
        post_id: postId,
        topic_id: topicId,
        reason: state.reason,
        claim_text: state.claimText,
        cf_turnstile_response: turnstile.token ?? undefined,
      })
      dispatch({ type: 'set_submitted' })
      turnstile.reset()
    } catch (error) {
      dispatch({
        type: 'set_error',
        value:
          error instanceof Error
            ? error.message
            : t('extracted.disputes.disputeReviewDialog.failedToSubmit_7ad354a8'),
      })
      onError(error, {
        fallback: t('extracted.disputes.disputeReviewDialog.anErrorOccurred_ddf785b7'),
      })
      turnstile.reset()
    } finally {
      dispatch({ type: 'set_loading', value: false })
    }
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => dispatch({ type: 'reset' }), 300)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
    >
      <DialogContent
        data-pw='dispute-review-dialog'
        onInteractOutside={e => {
          // Prevent click-outside from closing the dialog while the form is being
          // filled out. Radix Select (and other Radix popovers) render in a portal
          // that is outside the dialog DOM tree; without this, clicking a Select
          // option triggers the Dialog's onInteractOutside and closes the dialog
          // before the option's onValueChange fires.
          /* c8 ignore next -- browser-interaction handler; covered by Playwright, not Vitest */
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('extracted.disputes.disputeReviewDialog.disputeThisReview_a42b99e3')}
          </DialogTitle>
          <DialogDescription>
            {t('extracted.disputes.disputeReviewDialog.fileAFormalDisputeAsThe_6face10d')}
          </DialogDescription>
        </DialogHeader>
        <DisputeForm
          submitted={state.submitted}
          reason={state.reason}
          claimText={state.claimText}
          loading={state.loading}
          error={state.error}
          turnstile={turnstile}
          onReasonChange={v => dispatch({ type: 'set_reason', value: v })}
          onClaimTextChange={v => dispatch({ type: 'set_claim_text', value: v })}
          onSubmit={handleSubmit}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  )
}
