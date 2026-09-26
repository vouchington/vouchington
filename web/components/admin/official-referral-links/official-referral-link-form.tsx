'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
} from '@/lib/api/client/official-referral-links'
import onError, { onSuccess } from '@/lib/on-error'
import type { OfficialReferralLink } from '@/lib/api/server/referral-links'
import { useTranslations } from '@/lib/i18n/use-translations'
import { OfficialReferralLinksTable } from './official-referral-links-table'

interface OfficialReferralLinkFormProps {
  referralProgramId: string
  links: OfficialReferralLink[]
  validationInfo?: { user_help_text: string; example_urls: string[] } | null
}

export function OfficialReferralLinkForm({
  referralProgramId,
  links: initialLinks,
  validationInfo,
}: OfficialReferralLinkFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [links, setLinks] = useState(initialLinks)
  const [previousLinks, setPreviousLinks] = useState(initialLinks)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (initialLinks !== previousLinks) {
    setPreviousLinks(initialLinks)
    setLinks(initialLinks)
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    const nextUrl = url.trim()
    const nextLabel = label.trim() || null
    if (!nextUrl) return

    startTransition(async () => {
      try {
        const created = await createOfficialReferralLink(referralProgramId, {
          url: nextUrl,
          label: nextLabel,
        })
        setLinks(current => [
          ...current,
          {
            id: created.official_referral_link.id,
            url: nextUrl,
            label: nextLabel,
            activated_at: null,
          },
        ])
        onSuccess(
          t(
            'extracted.officialReferralLinks.officialReferralLinkForm.officialLinkCreated_1a3da640',
          ),
        )
        setUrl('')
        setLabel('')
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.officialReferralLinks.officialReferralLinkForm.failedToCreateOfficialLink_3db0a648',
          ),
        })
      }
    })
  }

  function handleDelete(linkId: string) {
    setDeletingId(linkId)
    startTransition(async () => {
      try {
        await deleteOfficialReferralLink(linkId)
        setLinks(current => current.filter(link => link.id !== linkId))
        onSuccess(
          t(
            'extracted.officialReferralLinks.officialReferralLinkForm.officialLinkDeleted_afed9064',
          ),
        )
        router.refresh()
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.officialReferralLinks.officialReferralLinkForm.failedToDeleteOfficialLink_820d32b6',
          ),
        })
      } finally {
        setDeletingId(null)
      }
    })
  }

  return (
    <div className='space-y-6'>
      <form
        onSubmit={handleSubmit}
        className='space-y-4'
        data-pw='official-referral-link-form'
      >
        <div className='space-y-2'>
          <Label htmlFor='official-link-url'>
            {t('extracted.officialReferralLinks.officialReferralLinkForm.url_e7a241de')}
          </Label>
          <Input
            id='official-link-url'
            type='url'
            placeholder={
              validationInfo?.example_urls?.[0] ?? 'https://www.brand.com/refer/your-code'
            }
            value={url}
            onChange={e => {
              setUrl(e.target.value)
            }}
            required
            data-pw='official-referral-link-url-input'
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='official-link-label'>
            {t('extracted.officialReferralLinks.officialReferralLinkForm.labelOptional_7df60caf')}
          </Label>
          <Input
            id='official-link-label'
            type='text'
            placeholder={t(
              'extracted.officialReferralLinks.officialReferralLinkForm.eGOfficialVouchaLink_7c2f2a91',
            )}
            value={label}
            onChange={e => {
              setLabel(e.target.value)
            }}
            data-pw='official-referral-link-label-input'
          />
        </div>
        <Button
          type='submit'
          loading={isPending}
          disabled={isPending || !url.trim()}
          data-pw='official-referral-link-submit'
        >
          {isPending
            ? t('extracted.officialReferralLinks.officialReferralLinkForm.adding_913a8849')
            : t(
                'extracted.officialReferralLinks.officialReferralLinkForm.addOfficialLink_74f50b76',
              )}
        </Button>
      </form>

      <OfficialReferralLinksTable
        links={links}
        deletingId={deletingId}
        isPending={isPending}
        onDelete={handleDelete}
      />
    </div>
  )
}
