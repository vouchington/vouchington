'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReferralLinkCard } from './referral-link-card'
import { getAllReferralLinks } from '@/lib/api/client/referral-links'
import onError from '@/lib/on-error'
import type { PrioritizedReferralLinksResponse } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReferralLinksShowAllProps {
  referralProgramId: string
}

function ShowAllList({ data }: { data: PrioritizedReferralLinksResponse }) {
  const t = useTranslations()
  if (data.links.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.referralLinks.referralLinksShowAll.noReferralLinksFound_ce6d5526')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {data.links.map(link => (
        <ReferralLinkCard
          key={link.id}
          link={link}
          user={link.user_id ? data.users[link.user_id] : undefined}
        />
      ))}
    </div>
  )
}

export function ReferralLinksShowAll({ referralProgramId }: ReferralLinksShowAllProps) {
  const t = useTranslations()
  const [data, setData] = useState<PrioritizedReferralLinksResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleShowAll() {
    setLoading(true)
    try {
      const result = await getAllReferralLinks(referralProgramId)
      setData(result)
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.referralLinks.referralLinksShowAll.failedToLoadReferralLinks_3e9e7e3a',
        ),
      })
    } finally {
      setLoading(false)
    }
  }

  if (data) {
    return (
      <div className='space-y-4'>
        <h3
          className='text-lg font-semibold'
          data-pw='referral-links-all-heading'
        >
          {t('extracted.referralLinks.referralLinksShowAll.allReferralLinks_6692443e')}
        </h3>
        <ShowAllList data={data} />
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      <Button
        variant='outline'
        onClick={handleShowAll}
        disabled={loading}
        data-pw='referral-links-show-all'
      >
        {loading
          ? t('extracted.referralLinks.referralLinksShowAll.loading_ba3bbbe1')
          : t('extracted.referralLinks.referralLinksShowAll.showAllReferralLinks_67391c39')}
      </Button>
    </div>
  )
}
