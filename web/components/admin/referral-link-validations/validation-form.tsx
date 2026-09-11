'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createAndLinkValidationToReferralProgram,
  createReferralLinkValidation,
  updateReferralLinkValidation,
  type ReferralLinkValidation,
} from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ValidationFormProps {
  existing?: ReferralLinkValidation | null
  onSaved?: (validation: ReferralLinkValidation) => void
  /** Base path for the validation detail route, e.g. `/referral-program/<slug>/validations`. */
  basePath: string
  /** If set, the newly created validation will be linked to this referral program. */
  referralProgramId?: string | null
}

export function ValidationForm({
  existing,
  onSaved,
  basePath,
  referralProgramId,
}: ValidationFormProps) {
  const t = useTranslations()
  const { replace, push } = useRouter()
  const [slug, setSlug] = useState(existing?.slug ?? '')
  const [userHelpText, setUserHelpText] = useState(existing?.user_help_text ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!slug.trim()) return

    startTransition(async () => {
      try {
        if (existing) {
          const result = await updateReferralLinkValidation(existing.id, {
            slug: slug.trim(),
            user_help_text: userHelpText.trim(),
          })
          onSuccess(
            t('extracted.referralLinkValidations.validationForm.validationUpdated_81a195cb'),
          )
          onSaved?.(result.validation)
          replace(`${basePath}/${result.validation.id}`)
        } else {
          let validation: ReferralLinkValidation
          if (referralProgramId) {
            const result = await createAndLinkValidationToReferralProgram(referralProgramId, {
              slug: slug.trim(),
              user_help_text: userHelpText.trim() || undefined,
            })
            validation = result.validation
          } else {
            const result = await createReferralLinkValidation({
              slug: slug.trim(),
              user_help_text: userHelpText.trim() || undefined,
            })
            validation = result.validation
          }
          onSuccess(
            t('extracted.referralLinkValidations.validationForm.validationCreated_30231380'),
          )
          onSaved?.(validation)
          push(`${basePath}/${validation.id}`)
        }
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.referralLinkValidations.validationForm.failedToSaveValidation_5f2bde32',
          ),
        })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
    >
      <div className='space-y-2'>
        <Label htmlFor='validation-slug'>
          {t('extracted.referralLinkValidations.validationForm.slug_d15387ec')}
        </Label>
        <Input
          id='validation-slug'
          type='text'
          placeholder={t(
            'extracted.referralLinkValidations.validationForm.eGChaseSapphire_1063fe9a',
          )}
          value={slug}
          onChange={e => {
            setSlug(e.target.value)
          }}
          required
          data-pw='validation-form-slug'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='validation-user-help-text'>
          {t('extracted.referralLinkValidations.validationForm.userHelpText_f4348908')}
        </Label>
        <Textarea
          id='validation-user-help-text'
          placeholder={t(
            'extracted.referralLinkValidations.validationForm.describeWhereTheUserCanFind_b0d03585',
          )}
          value={userHelpText}
          onChange={e => {
            setUserHelpText(e.target.value)
          }}
          rows={3}
          data-pw='validation-form-user-help-text'
        />
      </div>
      <Button
        type='submit'
        loading={isPending}
        disabled={isPending || !slug.trim()}
        data-pw='validation-form-submit'
      >
        {isPending
          ? t('extracted.referralLinkValidations.validationForm.saving_dc85af8f')
          : existing
            ? t('extracted.referralLinkValidations.validationForm.update_c1c1009d')
            : t('extracted.referralLinkValidations.validationForm.create_4759498a')}
      </Button>
    </form>
  )
}
