'use client'

import type { Hostname } from '@/types/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'
import { HostnameModerationControls } from './hostname-moderation-controls'

interface Props {
  hostname: Hostname
}

export default function DomainModerationPanel({ hostname }: Props) {
  const t = useTranslations()

  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold tracking-tight'>
        {t('extracted.domains.domainModerationPanel.moderation_126d4415')}
      </h2>
      <HostnameModerationControls
        hostnameId={hostname.id}
        blocked={hostname.blocked}
        crawlable={hostname.crawlable}
        linkRelFollow={hostname.link_rel_follow}
      />
    </section>
  )
}
