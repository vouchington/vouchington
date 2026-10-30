'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { createUserPathname } from '@/lib/links/entity-href'
import { formatUtcDate } from '@ts-shared/utils/format'
import { getUserLabel } from '@/lib/users/user-helpers'
import type {
  IntegrityPenaltiesState,
  IntegrityPenaltyRecord,
  IntegrityPenaltyStatus,
} from './use-integrity-penalties'

interface IntegrityPenaltyRowProps<P extends IntegrityPenaltyRecord> {
  domain: 'report' | 'vote'
  initialStatus: IntegrityPenaltyStatus
  multiplier: string | null
  penalty: P
  state: IntegrityPenaltiesState<P>
  reconciliationTestId?: string
  revokeTestId?: string
}

export function IntegrityPenaltyRow<P extends IntegrityPenaltyRecord>({
  domain,
  initialStatus,
  multiplier,
  penalty,
  reconciliationTestId = 'report-integrity-penalty-reconciliation',
  revokeTestId = 'report-integrity-penalty-revoke',
  state,
}: IntegrityPenaltyRowProps<P>) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const knownReason =
    penalty.reason === 'mass_report_campaign'
      ? t('extracted.flags.integrityPenalties.massReportCampaign_2ce35627')
      : penalty.reason === 'voting_ring'
        ? t('extracted.flags.integrityPenalties.votingRing_20963b95')
        : penalty.reason
  const sourceFlagType =
    penalty.source_flag_type === 'mass_report_suspected'
      ? t('extracted.flags.integrityActions.massReportSuspected_cc227ce2')
      : penalty.source_flag_type === 'velocity_spike'
        ? t('extracted.flags.integrityActions.velocitySpike_5be6d539')
        : penalty.source_flag_type === 'ip_correlation'
          ? t('extracted.flags.integrityActions.ipCorrelation_a7083d7c')
          : t('extracted.flags.integrityPenalties.notAvailable_89f46cc0')
  const isActive = penalty.revoked_at === null
  const isReconciling = !!state.reconciliationRequired[penalty.id]
  const deletedUserLabel = t('shared.user.deletedUser')
  const userLabel = getUserLabel(
    {
      username: penalty.user_username,
      display_account: { name: penalty.user_display_name },
    },
    deletedUserLabel,
  )
  const creatorLabel = getUserLabel(
    {
      username: penalty.creator_username,
      display_account: { name: penalty.creator_display_name },
    },
    deletedUserLabel,
  )
  const revokerLabel = getUserLabel(
    {
      username: penalty.revoker_username,
      display_account: { name: penalty.revoker_display_name },
    },
    deletedUserLabel,
  )
  return (
    <tr
      className='align-top hover:bg-muted/50'
      data-integrity-penalty-id={penalty.id}
    >
      <td className='px-4 py-4 text-sm'>
        {penalty.user_username ? (
          <Link
            href={createUserPathname(penalty.user_username)}
            prefetch={false}
            className='text-link hover:underline'
          >
            {userLabel}
          </Link>
        ) : (
          <span>{userLabel}</span>
        )}
      </td>
      <td className='px-4 py-4 text-sm text-foreground'>{knownReason}</td>
      {domain === 'vote' ? (
        <td className='px-4 py-4 text-sm text-foreground'>{multiplier}</td>
      ) : null}
      <td className='px-4 py-4 text-sm text-muted-foreground'>{sourceFlagType}</td>
      <td className='px-4 py-4 text-sm text-muted-foreground'>
        <time dateTime={penalty.created_at}>{formatUtcDate(penalty.created_at, uiLocale)}</time>
        {penalty.created_by_id && penalty.creator_username ? (
          <div>
            <Link
              href={createUserPathname(penalty.creator_username)}
              prefetch={false}
              className='text-link hover:underline'
            >
              {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
                actor: creatorLabel,
              })}
            </Link>
          </div>
        ) : penalty.created_by_id ? (
          <div>{creatorLabel}</div>
        ) : null}
      </td>
      <td className='px-4 py-4 text-sm'>
        <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>
          {isActive
            ? t('extracted.flags.integrityPenalties.active_8bb00d32')
            : t('extracted.flags.integrityPenalties.revoked_3321829a')}
        </span>
        {penalty.revoked_at ? (
          <div className='text-xs text-muted-foreground'>
            <time dateTime={penalty.revoked_at}>{formatUtcDate(penalty.revoked_at, uiLocale)}</time>
            {penalty.revoked_by_id && penalty.revoker_username ? (
              <div>
                <Link
                  href={createUserPathname(penalty.revoker_username)}
                  prefetch={false}
                  className='text-link hover:underline'
                >
                  {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
                    actor: revokerLabel,
                  })}
                </Link>
              </div>
            ) : penalty.revoked_by_id ? (
              <div>{revokerLabel}</div>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className='px-4 py-4 text-sm'>
        {isActive && initialStatus !== 'revoked' ? (
          <Button
            variant={state.confirming[penalty.id] ? 'destructive' : 'outline'}
            size='touchSm'
            disabled={isReconciling || !!state.actionLoading[penalty.id]}
            data-pw={revokeTestId}
            onClick={() => {
              void state.revokeWithConfirmation(penalty.id)
            }}
          >
            {state.actionLoading[penalty.id]
              ? t('extracted.flags.integrityPenalties.loading_521e3674')
              : state.confirming[penalty.id]
                ? t('extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c')
                : t('extracted.flags.integrityPenalties.revoke_ec2f3e37')}
          </Button>
        ) : null}
        {isReconciling ? (
          <div data-pw={reconciliationTestId}>
            <Button
              data-pw='integrity-penalty-row-reconcile'
              variant='outline'
              size='touchSm'
              onClick={() => {
                void state.reconcile(penalty.id)
              }}
            >
              {t('extracted.flags.integrityPenalties.reconcile_75147bb1')}
            </Button>
          </div>
        ) : null}
        {state.actionErrors[penalty.id] ? (
          <p className='mt-2 flex max-w-64 items-start gap-1 text-xs text-destructive'>
            <AlertCircle className='mt-0.5 h-3 w-3 shrink-0' />
            {state.actionErrors[penalty.id]}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
