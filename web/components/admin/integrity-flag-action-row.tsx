'use client'

import type { ReactNode } from 'react'
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
import { formatUtcDate } from '@ts-shared/utils/format'

type IntegrityFlagActionDomain = 'report' | 'vote'

export function IntegrityFlagResolvedActor({
  resolvedAt,
  resolvedById,
}: {
  resolvedAt: string
  resolvedById: string | null
}) {
  const t = useTranslations()
  return (
    <div className='text-xs text-muted-foreground'>
      <time dateTime={resolvedAt}>{formatUtcDate(resolvedAt)}</time>
      {resolvedById ? (
        <Link
          href={userHref({ id: resolvedById })}
          prefetch={false}
          className='block font-mono text-link hover:underline'
        >
          {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
            actor: resolvedById,
          })}
        </Link>
      ) : null}
    </div>
  )
}

export function IntegrityFlagUnresolvedActions({
  domain,
  resolution,
  onResolutionChange,
  actions,
  error,
  reconciliationRequired,
  onRetryReconciliation,
}: {
  domain: IntegrityFlagActionDomain
  resolution: string
  onResolutionChange: (value: string) => void
  actions: ReactNode
  error: string | undefined
  reconciliationRequired: boolean | undefined
  onRetryReconciliation: () => void
}) {
  const t = useTranslations()
  const resolutionLabel =
    domain === 'report'
      ? t('extracted.flags.reportIntegrityFlagsTable.resolution_d4055faf')
      : t('extracted.flags.voteIntegrityFlagsTable.resolution_d4055faf')
  const resolutionPlaceholder =
    domain === 'report'
      ? t('extracted.flags.reportIntegrityFlagsTable.resolution_3da993e6')
      : t('extracted.flags.voteIntegrityFlagsTable.resolution_3da993e6')
  const reconcileButton = (
    <Button
      size='touchSm'
      variant='outline'
      onClick={onRetryReconciliation}
    >
      {t('extracted.flags.integrityPenalties.reconcile_75147bb1')}
    </Button>
  )

  return (
    <div>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={resolution}
          onValueChange={onResolutionChange}
        >
          {domain === 'report' ? (
            <SelectTrigger
              className='h-8 w-36 text-xs'
              aria-label={resolutionLabel}
              data-pw='report-integrity-resolution-select'
            >
              <SelectValue placeholder={resolutionPlaceholder} />
            </SelectTrigger>
          ) : (
            <SelectTrigger
              className='h-8 w-36 text-xs'
              aria-label={resolutionLabel}
            >
              <SelectValue placeholder={resolutionPlaceholder} />
            </SelectTrigger>
          )}
          <SelectContent>
            {domain === 'report' ? (
              <SelectItem value='dismissed'>
                {t('extracted.flags.reportIntegrityFlagsTable.dismiss_48845bff')}
              </SelectItem>
            ) : (
              <>
                <SelectItem value='dismissed'>
                  {t('extracted.flags.voteIntegrityFlagsTable.dismiss_48845bff')}
                </SelectItem>
                <SelectItem value='penalized'>
                  {t('extracted.flags.voteIntegrityFlagsTable.penalize_b417c7b7')}
                </SelectItem>
                <SelectItem value='suspended'>
                  {t('extracted.flags.voteIntegrityFlagsTable.suspend_4948e134')}
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        {actions}
      </div>
      {!error && !reconciliationRequired ? null : (
        <div className='mt-2 text-xs text-destructive'>
          <p>{error}</p>
          {reconciliationRequired ? (
            domain === 'report' ? (
              <div data-pw='report-integrity-flag-reconciliation'>{reconcileButton}</div>
            ) : (
              <div data-pw='vote-integrity-flag-reconciliation'>{reconcileButton}</div>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}
