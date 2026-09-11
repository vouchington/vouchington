'use client'

import Link from 'next/link'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { topicHref } from '@/lib/links/entity-href'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import type { HostnameElection } from '@/types/hostnames'
import type { Topic } from '@/types/topics'
import { formatNumber } from '@ts-shared/utils/format'

interface FediverseInstanceMetadataProps {
  topic: Pick<Topic, 'id' | 'slug' | 'topic_type' | 'hostname'>
  attributes: FediverseInstanceAttributes | null
  hostnameElection: HostnameElection | null
}

export function FediverseInstanceMetadata({
  topic,
  attributes,
  hostnameElection,
}: FediverseInstanceMetadataProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const unknown = t('extracted.topics.fediverseInstanceMetadata.unknown_b764cdc0')
  const software = attributes?.software
  const version = attributes?.nodeinfo_software_version
  const rows = [
    {
      label: t('extracted.topics.fediverseInstanceMetadata.software_9b3289a3'),
      value: software ? `${software}${version ? ` ${version}` : ''}` : unknown,
    },
    {
      label: t('extracted.topics.fediverseInstanceMetadata.protocol_cf088334'),
      value: attributes?.protocol ?? unknown,
    },
    {
      label: t('extracted.topics.fediverseInstanceMetadata.users_6b0cc904'),
      value:
        attributes?.total_users == null ? unknown : formatNumber(attributes.total_users, uiLocale),
    },
    {
      label: t('extracted.topics.fediverseInstanceMetadata.activeThisMonth_4d2a79ba'),
      value:
        attributes?.monthly_active_users == null
          ? unknown
          : formatNumber(attributes.monthly_active_users, uiLocale),
    },
    {
      label: t('extracted.topics.fediverseInstanceMetadata.registrations_98da9fa3'),
      value:
        attributes?.open_registrations == null
          ? unknown
          : attributes.open_registrations
            ? t('extracted.topics.fediverseInstanceMetadata.open_ed077f3d')
            : t('extracted.topics.fediverseInstanceMetadata.closed_c21ead06'),
    },
  ]

  return (
    <section
      data-pw='fediverse-instance-metadata'
      className='rounded-lg border bg-card p-4'
    >
      <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {rows.map(row => (
          <div key={row.label}>
            <dt className='text-sm text-muted-foreground'>{row.label}</dt>
            <dd className='font-medium'>{row.value}</dd>
          </div>
        ))}
        <div>
          <dt className='text-sm text-muted-foreground'>
            {t('extracted.topics.fediverseInstanceMetadata.trust_ade9248e')}
          </dt>
          <dd className='mt-1'>
            {topic.hostname ? (
              <DomainTrustBadge
                scoreNet={hostnameElection?.votes_score_net ?? 0}
                countUp={hostnameElection?.votes_count_up ?? 0}
                countDown={hostnameElection?.votes_count_down ?? 0}
                hostname={topic.hostname.hostname}
                href={topicHref(topic)}
                size='xs'
              />
            ) : (
              <Link
                href={topicHref(topic)}
                prefetch={false}
                className='text-sm text-muted-foreground hover:underline'
              >
                {t('extracted.topics.fediverseInstanceMetadata.unrated_c29bb93b')}
              </Link>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
