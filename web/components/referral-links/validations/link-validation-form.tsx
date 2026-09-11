'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getReferralLinkValidation,
  linkValidationToReferralProgram,
} from '@/lib/api/client/referral-link-validations'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface LinkValidationFormProps {
  referralProgramId: string
}

export function LinkValidationForm({ referralProgramId }: LinkValidationFormProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [slug, setSlug] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = slug.trim()
    if (!trimmed) return

    startTransition(async () => {
      try {
        let validationId: string
        let validationSlug: string

        if (UUID_REGEX.test(trimmed)) {
          validationId = trimmed
          validationSlug = trimmed
        } else {
          try {
            const { validation } = await getReferralLinkValidation(trimmed)
            validationId = validation.id
            validationSlug = validation.slug
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
              onError(new Error('Validation not found'), {
                fallback: t(
                  'extracted.validations.linkValidationForm.noValidationFoundForSlug_51caf7f8',
                  {
                    slug: trimmed,
                  },
                ),
                skipSentry: true,
              })
              return
            }
            /* c8 ignore next -- re-throw for non-abort errors; injecting this path requires mocking */
            throw error
          }
        }

        await linkValidationToReferralProgram(referralProgramId, validationId)
        onSuccess(
          t('extracted.validations.linkValidationForm.linkedValidationSlug_c4596e98', {
            slug: validationSlug,
          }),
        )
        setSlug('')
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t('extracted.validations.linkValidationForm.failedToLinkValidation_c04c3103'),
        })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='flex gap-2'
    >
      <div className='flex-1 space-y-1'>
        <Label htmlFor='link-validation-slug'>
          {t('extracted.validations.linkValidationForm.validationSlug_8ae882c6')}
        </Label>
        <Input
          id='link-validation-slug'
          type='text'
          placeholder={t('extracted.validations.linkValidationForm.eGChaseSapphire_1063fe9a')}
          value={slug}
          onChange={e => setSlug(e.target.value)}
          required
          data-pw='link-validation-slug-input'
        />
      </div>
      <div className='flex items-end'>
        <Button
          type='submit'
          loading={isPending}
          disabled={isPending || !slug.trim()}
          data-pw='link-validation-submit'
        >
          {isPending
            ? t('extracted.validations.linkValidationForm.linking_e99ee264')
            : t('extracted.validations.linkValidationForm.link_a6a32dbc')}
        </Button>
      </div>
    </form>
  )
}
