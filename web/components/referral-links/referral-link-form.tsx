'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createReferralLink,
  updateReferralLink,
  deleteReferralLink,
} from '@/lib/api/client/referral-links'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReferralLinkFormProps {
  referralProgramId: string
  existingLink?: {
    id: string
    url: string
    label: string | null
  } | null
  onSaved?: () => void
  validationInfo?: { user_help_text: string; example_urls: string[] } | null
}

export function ReferralLinkForm({
  referralProgramId,
  existingLink,
  onSaved,
  validationInfo,
}: ReferralLinkFormProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [url, setUrl] = useState(existingLink?.url ?? '')
  const [label, setLabel] = useState(existingLink?.label ?? '')
  const [isPending, startTransition] = useTransition()
  const SubmitIcon = existingLink ? EntityActionIcons.edit : EntityActionIcons.referralLinkCreate
  const DeleteIcon = EntityActionIcons.delete

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!existingLink && !trimmedUrl) return

    startTransition(async () => {
      try {
        if (existingLink) {
          await updateReferralLink(existingLink.id, {
            label: label.trim() || null,
          })
        } else {
          await createReferralLink({
            referral_program_id: referralProgramId,
            url: trimmedUrl,
            label: label.trim() || null,
          })
        }
        onSuccess(t('extracted.referralLinks.referralLinkForm.referralLinkSaved_405751ae'))
        onSaved?.()
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t('extracted.referralLinks.referralLinkForm.failedToSaveReferralLink_83612a5e'),
        })
      }
    })
  }

  function handleDelete() {
    if (!existingLink) return

    startTransition(async () => {
      try {
        await deleteReferralLink(existingLink.id)
        setUrl('')
        setLabel('')
        onSuccess(t('extracted.referralLinks.referralLinkForm.referralLinkDeleted_e04c8b57'))
        onSaved?.()
        refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.referralLinks.referralLinkForm.failedToDeleteReferralLink_68bdf774',
          ),
        })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4 rounded-md border p-4'
    >
      <h3
        className='text-sm font-semibold'
        data-pw='referral-link-form-heading'
      >
        {existingLink
          ? t('extracted.referralLinks.referralLinkForm.editYourReferralLink_b3a9a16e')
          : t('extracted.referralLinks.referralLinkForm.addYourReferralLink_f189ae13')}
      </h3>
      {!existingLink && (
        <div className='space-y-2'>
          <Label htmlFor='referral-url'>
            {t('extracted.referralLinks.referralLinkForm.referralUrl_b4af0546')}
          </Label>
          {validationInfo?.user_help_text && (
            <p className='text-xs text-muted-foreground'>{validationInfo.user_help_text}</p>
          )}
          <Input
            id='referral-url'
            type='url'
            placeholder={
              validationInfo?.example_urls?.[0] ?? 'https://www.brand.com/refer/your-code'
            }
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            data-pw='referral-link-form-url'
          />
        </div>
      )}
      {existingLink && (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.referralLinks.referralLinkForm.urlUrl_38ef9da8', { url: existingLink.url })}
        </p>
      )}
      <div className='space-y-2'>
        <Label htmlFor='referral-label'>
          {t('extracted.referralLinks.referralLinkForm.labelOptional_7df60caf')}
        </Label>
        <Input
          id='referral-label'
          type='text'
          placeholder={t('extracted.referralLinks.referralLinkForm.myReferralLink_c7602396')}
          value={label}
          onChange={e => setLabel(e.target.value)}
          data-pw='referral-link-form-label'
        />
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={isPending}
          disabled={isPending || (!existingLink && !url.trim())}
        >
          <SubmitIcon />
          {existingLink
            ? t('extracted.referralLinks.referralLinkForm.updateLink_5194042e')
            : t('extracted.referralLinks.referralLinkForm.addLink_b8c42654')}
        </Button>
        {existingLink && (
          <Button
            type='button'
            variant='destructive'
            disabled={isPending}
            onClick={handleDelete}
          >
            <DeleteIcon />
            {t('extracted.referralLinks.referralLinkForm.delete_e2d0a549')}
          </Button>
        )}
      </div>
    </form>
  )
}
