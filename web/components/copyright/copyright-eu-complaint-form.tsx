'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createCopyrightEuRedress } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'

export function CopyrightEuComplaintForm({ noticeId }: { noticeId: string }) {
  const router = useRouter()
  const turnstile = useTurnstileToken()
  const [explanation, setExplanation] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  function submit() {
    if (!explanation.trim() || !turnstile.token || pending || submitted) return
    startTransition(async () => {
      try {
        const result = await createCopyrightEuRedress(noticeId, {
          explanation: explanation.trim(),
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        setSubmitted(true)
        turnstile.reset()
        onSuccess(
          result.copyright_eu_redress_request.is_duplicate
            ? 'This complaint was already received.'
            : 'Complaint received. A moderator will review it.',
        )
        router.push(`/copyright/notices/${noticeId}`)
      } catch (err) {
        onError(err, {
          fallback: 'We could not submit this complaint. Please try again.',
          tags: { form: 'copyright-eu-complaint' },
        })
        turnstile.reset()
      }
    })
  }
  return (
    <form
      className='space-y-4'
      data-pw='copyright-eu-complaint-form'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <p>A moderator will review your complaint about this decision.</p>
      <div className='space-y-1'>
        <Label htmlFor='copyright-eu-complaint-explanation'>
          Why should this decision be changed?
        </Label>
        <Textarea
          id='copyright-eu-complaint-explanation'
          value={explanation}
          onChange={event => setExplanation(event.target.value)}
          maxLength={50000}
          required
          disabled={pending || submitted}
        />
      </div>
      <TurnstileField turnstile={turnstile} />
      <Button
        type='submit'
        size='touchSm'
        disabled={pending || submitted || !explanation.trim() || !turnstile.token}
      >
        Submit complaint
      </Button>
    </form>
  )
}
