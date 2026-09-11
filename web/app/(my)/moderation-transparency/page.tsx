export const dynamic = 'force-dynamic'

import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getModerationTransparencyOrNull } from '@/lib/api/server/moderation-analytics'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { ModerationAnalyticsRange } from '@/types/moderation-analytics'

const VALID_RANGES = new Set<ModerationAnalyticsRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: string | undefined): ModerationAnalyticsRange {
  if (raw && VALID_RANGES.has(raw as ModerationAnalyticsRange))
    return raw as ModerationAnalyticsRange
  return '30d'
}

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export async function generateMetadata() {
  const t = await getTranslations()
  return createNoIndexMetadata(
    t('extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9'),
  )
}

export default async function ModerationTransparencyPage({ searchParams }: PageProps) {
  const { range: rawRange } = await searchParams
  const range = parseRange(rawRange)
  const [t, transparency] = await Promise.all([
    getTranslations(),
    getModerationTransparencyOrNull({ range }),
  ])

  return (
    <div
      className='space-y-6'
      data-pw='moderation-transparency-page'
    >
      <SettingsPageHeader
        title={t(
          'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
        )}
        description={t(
          'extracted.moderationAnalytics.moderationTransparencyPanel.releasedAggregateModerationDataCountsAreDelayedAndPrivacyProtected_9a7a228c',
        )}
      />
      <ModerationAnalyticsRangeFilter
        basePath='/moderation-transparency'
        range={range}
        todayLabelKey='extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31'
      />
      <ModerationTransparencyPanel
        transparency={transparency}
        showTitle={false}
      />
    </div>
  )
}
