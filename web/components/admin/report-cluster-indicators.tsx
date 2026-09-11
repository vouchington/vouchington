'use client'

import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { AdminModerationReportCluster } from './reports-client-types'

export function IndicatorBadges({ cluster }: { cluster: AdminModerationReportCluster }) {
  const t = useTranslations()
  return (
    <>
      {cluster.indicators.content_hash_duplicate ? (
        <Badge
          variant='secondary'
          asChild
        >
          <span>{t('extracted.admin.reportClusterIndicators.contentDuplicate_c2f384e6')}</span>
        </Badge>
      ) : null}
      {cluster.indicators.embeddings_similarity ? (
        <Badge
          variant='secondary'
          asChild
        >
          <span>{t('extracted.admin.reportClusterIndicators.embeddingMatch_766ba9b0')}</span>
        </Badge>
      ) : null}
      {cluster.indicators.velocity_spike ? (
        <Badge
          variant='destructive'
          asChild
        >
          <span>
            <AlertTriangle className='mr-1 size-3' />
            {t('extracted.admin.reportClusterIndicators.voteSpike_c070e81a')}
          </span>
        </Badge>
      ) : null}
    </>
  )
}
