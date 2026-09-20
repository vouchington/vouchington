'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createCopyrightNotice } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'
import { DeclarationCheckbox, LabeledInput, LabeledTextarea } from './copyright-form-fields'

export function CopyrightNoticeForm() {
  const router = useRouter()
  const turnstile = useTurnstileToken()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState({
    name: '',
    contact: '',
    email: '',
    work: '',
    signature: '',
    postId: '',
    imageId: '',
    targetUrl: '',
    goodFaithBelief: false,
    authorityDeclaration: false,
  })
  const set =
    (key: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues(current => ({ ...current, [key]: event.target.value }))

  function submit() {
    if (!turnstile.token || pending) return
    startTransition(async () => {
      try {
        const result = await createCopyrightNotice({
          claimant_display_name: values.name.trim(),
          claimant_contact: values.contact.trim(),
          claimant_email: values.email.trim(),
          work_description: values.work.trim(),
          electronic_signature: values.signature.trim(),
          good_faith_belief: values.goodFaithBelief,
          accuracy_authority_under_penalty_of_perjury: values.authorityDeclaration,
          targets: [
            {
              post_id: values.postId.trim(),
              image_id: values.imageId.trim(),
              target_url: values.targetUrl.trim(),
            },
          ],
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        onSuccess(
          result.is_duplicate
            ? 'This notice was already received.'
            : 'Notice received. We will notify you about the review.',
        )
        router.push('/copyright/notices')
      } catch (error) {
        onError(error, {
          fallback: 'We could not submit this notice. Please try again.',
          tags: { form: 'copyright-notice' },
        })
        turnstile.reset()
      }
    })
  }

  return (
    <form
      data-pw='copyright-notice-form'
      className='space-y-4'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <p className='text-sm text-muted-foreground'>
        This US copyright process is not active until the designated agent is registered and
        published.
      </p>
      <LabeledInput
        id='copyright-name'
        label='Full legal name'
        value={values.name}
        onChange={set('name')}
        required
      />
      <LabeledInput
        id='copyright-contact'
        label='Mailing address'
        value={values.contact}
        onChange={set('contact')}
        required
      />
      <LabeledInput
        id='copyright-email'
        label='Email address'
        type='email'
        value={values.email}
        onChange={set('email')}
        required
      />
      <LabeledTextarea
        id='copyright-work'
        label='Copyrighted work'
        value={values.work}
        onChange={set('work')}
        required
      />
      <LabeledInput
        id='copyright-post-id'
        label='Hosted post ID'
        value={values.postId}
        onChange={set('postId')}
        required
      />
      <LabeledInput
        id='copyright-image-id'
        label='Hosted image ID'
        value={values.imageId}
        onChange={set('imageId')}
        required
      />
      <LabeledInput
        id='copyright-target-url'
        label='Hosted use URL'
        type='url'
        value={values.targetUrl}
        onChange={set('targetUrl')}
        required
      />
      <DeclarationCheckbox
        id='copyright-good-faith-belief'
        checked={values.goodFaithBelief}
        onCheckedChange={checked =>
          setValues(current => ({ ...current, goodFaithBelief: checked === true }))
        }
      >
        I have a good-faith belief that use of the material in the manner complained of is not
        authorized by the copyright owner, its agent, or the law.
      </DeclarationCheckbox>
      <DeclarationCheckbox
        id='copyright-authority-declaration'
        checked={values.authorityDeclaration}
        onCheckedChange={checked =>
          setValues(current => ({ ...current, authorityDeclaration: checked === true }))
        }
      >
        I state that the information in this notice is accurate and, under penalty of perjury, that
        I am authorized to act on behalf of the owner of an exclusive right that is allegedly
        infringed.
      </DeclarationCheckbox>
      <LabeledInput
        id='copyright-signature'
        label='Electronic signature'
        value={values.signature}
        onChange={set('signature')}
        required
      />
      <TurnstileField turnstile={turnstile} />
      <Button
        type='submit'
        disabled={
          pending || !turnstile.token || !values.goodFaithBelief || !values.authorityDeclaration
        }
      >
        Submit notice
      </Button>
    </form>
  )
}
