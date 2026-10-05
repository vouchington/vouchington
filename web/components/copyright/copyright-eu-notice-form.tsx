'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useAuth } from '@/lib/auth/context'
import { createCopyrightEuNotice } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'
import { DeclarationCheckbox, LabeledInput, LabeledTextarea } from './copyright-form-fields'
import { CopyrightEuGuestReceipt } from './copyright-eu-guest-receipt'

export function CopyrightEuNoticeForm() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const turnstile = useTurnstileToken()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState({
    name: '',
    email: '',
    contact: '',
    work: '',
    grounds: '',
    hostedUseUrl: '',
    goodFaith: false,
  })
  const [guestReceipt, setGuestReceipt] = useState<{ id: string; duplicate: boolean } | null>(null)
  const set =
    (key: 'name' | 'email' | 'contact' | 'work' | 'grounds' | 'hostedUseUrl') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues(current => ({ ...current, [key]: event.target.value }))

  function submit() {
    if (!turnstile.token || !values.goodFaith || pending) return
    startTransition(async () => {
      try {
        const response = await createCopyrightEuNotice({
          notifier_name: values.name.trim(),
          notifier_email: values.email.trim(),
          contact: values.contact.trim(),
          content_description: values.work.trim(),
          grounds: values.grounds.trim(),
          hosted_use_url: values.hostedUseUrl.trim(),
          has_good_faith_statement: true,
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        const notice = response.copyright_eu_notice
        if (!currentUser) {
          setGuestReceipt({ id: notice.notice_id, duplicate: notice.is_duplicate })
          return
        }
        onSuccess(
          notice.is_duplicate
            ? 'This notice was already received.'
            : 'Notice received. We will email you about the decision.',
        )
        router.push(`/copyright/notices/${notice.notice_id}`)
      } catch (err) {
        onError(err, {
          fallback: 'We could not submit this notice. Please try again.',
          tags: { form: 'copyright-eu-notice' },
        })
        turnstile.reset()
      }
    })
  }

  if (guestReceipt)
    return (
      <CopyrightEuGuestReceipt
        noticeId={guestReceipt.id}
        email={values.email.trim()}
        duplicate={guestReceipt.duplicate}
      />
    )

  return (
    <form
      data-pw='copyright-eu-notice-form'
      className='space-y-4'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <p className='text-sm text-muted-foreground'>
        A moderator reviews each notice. We send a receipt and the decision to the email address you
        provide.
      </p>
      <LabeledInput
        id='eu-notifier-name'
        label='Your name'
        value={values.name}
        onChange={set('name')}
        maxLength={200}
        required
      />
      <LabeledInput
        id='eu-notifier-email'
        label='Email address'
        type='email'
        value={values.email}
        onChange={set('email')}
        maxLength={254}
        required
      />
      <LabeledTextarea
        id='eu-contact'
        label='Contact details'
        value={values.contact}
        onChange={set('contact')}
        required
      />
      <LabeledTextarea
        id='eu-work'
        label='Copyrighted work'
        value={values.work}
        onChange={set('work')}
        required
      />
      <LabeledTextarea
        id='eu-grounds'
        label='Why this use infringes your rights'
        value={values.grounds}
        onChange={set('grounds')}
        required
      />
      <LabeledInput
        id='eu-hosted-use-url'
        label='Exact URL of the material on Voucha'
        type='url'
        value={values.hostedUseUrl}
        onChange={set('hostedUseUrl')}
        required
      />
      <DeclarationCheckbox
        id='eu-good-faith-statement'
        checked={values.goodFaith}
        onCheckedChange={checked =>
          setValues(current => ({ ...current, goodFaith: checked === true }))
        }
      >
        I believe in good faith that the information and allegations in this notice are accurate and
        complete.
      </DeclarationCheckbox>
      <TurnstileField turnstile={turnstile} />
      <Button
        type='submit'
        disabled={pending || !turnstile.token || !values.goodFaith}
      >
        Submit EU notice
      </Button>
    </form>
  )
}
