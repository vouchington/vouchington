'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { userHref } from '@/lib/links/entity-href'
import { formatUtcDate } from '@ts-shared/utils/format'
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
  const isActive = penalty.revoked_at === null
  const isReconciling = !!state.reconciliationRequired[penalty.id]
  return (
    <tr
      className='align-top hover:bg-muted/50'
      data-integrity-penalty-id={penalty.id}
    >
      <td className='px-4 py-4 text-sm'>
        <Link
          href={userHref({ id: penalty.user_id })}
          prefetch={false}
          className='font-mono text-link hover:underline'
        >
          {penalty.user_id}
        </Link>
      </td>
      <td className='px-4 py-4 text-sm text-foreground'>{knownReason}</td>
      {domain === 'vote' ? (
        <td className='px-4 py-4 text-sm text-foreground'>{multiplier}</td>
      ) : null}
      <td className='px-4 py-4 font-mono text-sm text-muted-foreground'>
        {penalty.source_flag_id ?? t('extracted.flags.integrityPenalties.notAvailable_89f46cc0')}
      </td>
      <td className='px-4 py-4 text-sm text-muted-foreground'>
        <time dateTime={penalty.created_at}>{formatUtcDate(penalty.created_at, uiLocale)}</time>
        {penalty.created_by_id ? (
          <div>
            <Link
              href={userHref({ id: penalty.created_by_id })}
              prefetch={false}
              className='font-mono text-link hover:underline'
            >
              {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
                actor: penalty.created_by_id,
              })}
            </Link>
          </div>
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
            {penalty.revoked_by_id ? (
              <div>
                <Link
                  href={userHref({ id: penalty.revoked_by_id })}
                  prefetch={false}
                  className='font-mono text-link hover:underline'
                >
                  {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
                    actor: penalty.revoked_by_id,
                  })}
                </Link>
              </div>
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
