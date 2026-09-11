'use client'

import { Button } from '@/components/ui/button'
import type { VoteIntegrityFlag } from '@/types/vote-integrity'
import type { VoteIntegrityFlagsState } from './use-vote-integrity-flags'
import { useTranslations } from '@/lib/i18n/use-translations'

interface VoteIntegrityFlagActionProps {
  flag: VoteIntegrityFlag
  state: Pick<
    VoteIntegrityFlagsState,
    | 'actionLoading'
    | 'applyPenaltyWithConfirmation'
    | 'handleResolve'
    | 'penaltyApplied'
    | 'penaltyConfirm'
    | 'penaltyResults'
    | 'resolutions'
  >
}

export function ResolveFlagButton({ flag, state }: VoteIntegrityFlagActionProps) {
  const t = useTranslations()
  return (
    <Button
      size='sm'
      variant='outline'
      data-pw='resolve-flag-button'
      loading={state.actionLoading[flag.id]}
      disabled={!state.resolutions[flag.id] || state.actionLoading[flag.id]}
      onClick={() => state.handleResolve(flag.id)}
    >
      {t('extracted.flags.voteIntegrityFlagActions.resolve_c8f193b3')}
    </Button>
  )
}

export function ApplyPenaltyButton({ flag, state }: VoteIntegrityFlagActionProps) {
  const t = useTranslations()
  const penaltyResult = state.penaltyResults[flag.id]
  const penaltyApplied = state.penaltyApplied[flag.id] === true
  return (
    <Button
      size='sm'
      variant='outline'
      data-pw='apply-penalty-button'
      loading={state.actionLoading[flag.id]}
      disabled={state.actionLoading[flag.id] || penaltyResult !== undefined || penaltyApplied}
      onClick={() => state.applyPenaltyWithConfirmation(flag.id)}
      title={t('extracted.flags.voteIntegrityFlagActions.applyRingPenaltyToAllVoters_69ff016e')}
    >
      {penaltyResult !== undefined
        ? t('extracted.flags.voteIntegrityFlagActions.countPenalized_2a7e9c14', {
            count: penaltyResult,
          })
        : penaltyApplied
          ? t('extracted.flags.voteIntegrityFlagActions.penaltyApplied_c21b6fb4')
          : state.penaltyConfirm[flag.id]
            ? t('extracted.flags.voteIntegrityFlagActions.confirm_5d8b3f26')
            : t('extracted.flags.voteIntegrityFlagActions.applyPenalty_9c1e4a70')}
    </Button>
  )
}
