'use client'

import Link from 'next/link'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { topicHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import type { HostnameElection } from '@/types/hostnames'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicCardFediverseRowProps {
  topic: Pick<Topic, 'id' | 'slug' | 'topic_type' | 'hostname'>
  /** Hostname trust-vote data for the trust badge; "Unrated" until a caller supplies it. */
  hostnameElection?: HostnameElection
  fediverseInstance?: FediverseInstanceAttributes
}

export function TopicCardFediverseRow({
  topic,
  hostnameElection,
  fediverseInstance,
}: TopicCardFediverseRowProps) {
  const t = useTranslations()
  const software = fediverseInstance?.software
  const version = fediverseInstance?.nodeinfo_software_version
  return (
    <div
      data-pw='fediverse-instance-card-metadata'
      className='mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground'
    >
      <span>
        {software
          ? `${software}${version ? ` ${version}` : ''}`
          : t('extracted.topics.topicCardFediverseRow.unclassified_1372a381')}
      </span>
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
          className='hover:underline'
        >
          Unrated
        </Link>
      )}
    </div>
  )
}
