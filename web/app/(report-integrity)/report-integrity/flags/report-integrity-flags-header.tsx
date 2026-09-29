'use client'

import {
  IntegrityFlagsHeader,
  type IntegrityFlagsHeaderProps,
} from '@/components/admin/integrity-flags-header'
import { useTranslations } from '@/lib/i18n/use-translations'

type ReportIntegrityFlagsHeaderProps = Pick<
  IntegrityFlagsHeaderProps,
  'isPending' | 'onRefresh' | 'onStatusChange' | 'selectedStatus'
>

export function ReportIntegrityFlagsHeader(props: ReportIntegrityFlagsHeaderProps) {
  const t = useTranslations()
  return (
    <IntegrityFlagsHeader
      {...props}
      flagsHref='/report-integrity/flags'
      headingDataPw='report-integrity-flags-heading'
      labels={{
        all: t('extracted.flags.reportIntegrityFlagsHeader.all_a52ace42'),
        description: t(
          'extracted.flags.reportIntegrityFlagsHeader.reviewAndResolveSuspectedMassReport_a0729655',
        ),
        flags: t('extracted.flags.integrityPenalties.flags_81a36f40'),
        penalties: t('extracted.flags.integrityPenalties.penalties_f9ca26c7'),
        pending: t('extracted.flags.reportIntegrityFlagsHeader.pending_331551b0'),
        refresh: t('extracted.flags.reportIntegrityFlagsHeader.refreshFlags_2bf69363'),
        resolved: t('extracted.flags.reportIntegrityFlagsHeader.resolved_5be3c2c8'),
        status: t('extracted.flags.reportIntegrityFlagsHeader.filterFlagsByStatus_dc937672'),
        title: t('extracted.flags.reportIntegrityFlagsHeader.reportIntegrityFlags_b3271a57'),
      }}
      penaltiesDataPw='report-integrity-penalties-tab'
      penaltiesHref='/report-integrity/penalties'
    />
  )
}
