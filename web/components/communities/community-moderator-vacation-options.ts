import { useTranslations } from '@/lib/i18n/use-translations'

type Translate = ReturnType<typeof useTranslations>

export function moderatorVacationDurationOptions(t: Translate) {
  return [
    {
      value: 'indefinite',
      label: t('extracted.communities.communityModeratorVacationPanel.untilITurnItOff_0671ba75'),
    },
    {
      value: '7',
      label: t('extracted.communities.communityModeratorVacationPanel.7Days_7f920bb6'),
    },
    {
      value: '14',
      label: t('extracted.communities.communityModeratorVacationPanel.14Days_60acc36e'),
    },
    {
      value: '30',
      label: t('extracted.communities.communityModeratorVacationPanel.30Days_ffd72805'),
    },
  ]
}
