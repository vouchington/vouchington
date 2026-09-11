import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'
import { ModerationTransparencyPanel } from '@/components/moderation/moderation-transparency-panel'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function Loading() {
  const t = await getTranslations()
  return (
    <div className='space-y-6'>
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
        range='30d'
        todayLabelKey='extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31'
      />
      <ModerationTransparencyPanel
        transparency={undefined}
        isLoading
        showTitle={false}
      />
    </div>
  )
}
