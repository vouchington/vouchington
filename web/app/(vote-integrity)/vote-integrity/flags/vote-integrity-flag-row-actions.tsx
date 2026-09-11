'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { userHref } from '@/lib/links/entity-href'
import type { FlagResolution, VoteIntegrityFlag } from '@/types/vote-integrity'
import { formatUtcDate } from '@ts-shared/utils/format'
import { ApplyPenaltyButton, ResolveFlagButton } from './vote-integrity-flag-actions'
import type { VoteIntegrityFlagsTableProps } from './vote-integrity-flags-table'

type FlagActionProps = {
  flag: VoteIntegrityFlag
  state: VoteIntegrityFlagsTableProps
}

export function VoteIntegrityFlagActions({ flag, state }: FlagActionProps) {
  const t = useTranslations()
  if (flag.resolved_at) {
    return (
      <div className='text-xs text-muted-foreground'>
        <time dateTime={flag.resolved_at}>{formatUtcDate(flag.resolved_at)}</time>
        {flag.resolved_by_id ? (
          <Link
            href={userHref({ id: flag.resolved_by_id })}
            prefetch={false}
            className='block font-mono text-link hover:underline'
          >
            {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
              actor: flag.resolved_by_id,
            })}
          </Link>
        ) : null}
      </div>
    )
  }
  return (
    <div>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={state.resolutions[flag.id] ?? ''}
          onValueChange={value => state.updateResolution(flag.id, value as FlagResolution)}
        >
          <SelectTrigger
            className='h-8 w-36 text-xs'
            aria-label={t('extracted.flags.voteIntegrityFlagsTable.resolution_d4055faf')}
          >
            <SelectValue
              placeholder={t('extracted.flags.voteIntegrityFlagsTable.resolution_3da993e6')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='dismissed'>
              {t('extracted.flags.voteIntegrityFlagsTable.dismiss_48845bff')}
            </SelectItem>
            <SelectItem value='penalized'>
              {t('extracted.flags.voteIntegrityFlagsTable.penalize_b417c7b7')}
            </SelectItem>
            <SelectItem value='suspended'>
              {t('extracted.flags.voteIntegrityFlagsTable.suspend_4948e134')}
            </SelectItem>
          </SelectContent>
        </Select>
        <ResolveFlagButton
          flag={flag}
          state={state}
        />
        <ApplyPenaltyButton
          flag={flag}
          state={state}
        />
      </div>
      <FlagActionFeedback
        flag={flag}
        state={state}
      />
    </div>
  )
}

function FlagActionFeedback({ flag, state }: FlagActionProps) {
  const t = useTranslations()
  if (!state.actionErrors[flag.id] && !state.reconciliationRequired[flag.id]) return null
  return (
    <div className='mt-2 text-xs text-destructive'>
      <p>{state.actionErrors[flag.id]}</p>
      {state.reconciliationRequired[flag.id] ? (
        <div data-pw='vote-integrity-flag-reconciliation'>
          <Button
            size='touchSm'
            variant='outline'
            onClick={() => {
              void state.retryReconciliation(flag.id)
            }}
          >
            {t('extracted.flags.integrityPenalties.reconcile_75147bb1')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
