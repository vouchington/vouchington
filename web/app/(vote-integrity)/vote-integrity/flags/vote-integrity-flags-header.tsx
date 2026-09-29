'use client'

import {
  IntegrityFlagsHeader,
  type IntegrityFlagsHeaderProps,
} from '@/components/admin/integrity-flags-header'
import { useTranslations } from '@/lib/i18n/use-translations'

type VoteIntegrityFlagsHeaderProps = Pick<
  IntegrityFlagsHeaderProps,
  'isPending' | 'onRefresh' | 'onStatusChange' | 'selectedStatus'
>

export function VoteIntegrityFlagsHeader(props: VoteIntegrityFlagsHeaderProps) {
  const t = useTranslations()
  return (
    <IntegrityFlagsHeader
      {...props}
      flagsHref='/vote-integrity/flags'
      headingDataPw='vote-integrity-flags-heading'
      labels={{
        all: t('extracted.flags.voteIntegrityFlagsHeader.all_a52ace42'),
        description: t(
          'extracted.flags.voteIntegrityFlagsHeader.reviewAndResolveSuspiciousVotingPatterns_5d176e8e',
        ),
        flags: t('extracted.flags.integrityPenalties.flags_81a36f40'),
        penalties: t('extracted.flags.integrityPenalties.penalties_f9ca26c7'),
        pending: t('extracted.flags.voteIntegrityFlagsHeader.pending_331551b0'),
        refresh: t('extracted.flags.voteIntegrityFlagsHeader.refreshFlags_2bf69363'),
        resolved: t('extracted.flags.voteIntegrityFlagsHeader.resolved_5be3c2c8'),
        status: t('extracted.flags.voteIntegrityFlagsHeader.filterFlagsByStatus_dc937672'),
        title: t('extracted.flags.voteIntegrityFlagsHeader.voteIntegrityFlags_1917e940'),
      }}
      penaltiesDataPw='vote-integrity-penalties-tab'
      penaltiesHref='/vote-integrity/penalties'
      statusFilterDataPw='vote-integrity-flags-status-filter'
    />
  )
}
