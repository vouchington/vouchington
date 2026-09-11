'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  useIntegrityPenalties,
  type IntegrityPenaltyRecord,
  type IntegrityPenaltyStatus,
} from './use-integrity-penalties'
import { IntegrityPenaltiesHeader } from './integrity-penalties-header'
import { IntegrityPenaltiesTable } from './integrity-penalties-table'

interface IntegrityPenaltiesClientProps<P extends IntegrityPenaltyRecord> {
  domain: 'report' | 'vote'
  available?: boolean
  endpoint: string
  flagsPath: string
  initialData: {
    results: P[]
    page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
  }
  initialStatus: IntegrityPenaltyStatus
  multiplier: (penalty: P) => string | null
  paginationParams?: Record<string, string>
  penaltiesPath: string
  getById: (id: string) => Promise<{ penalty: P }>
  revoke: (id: string) => Promise<{ penalty: P }>
  scopeGuard?: (page: {
    results: P[]
    page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
  }) => boolean
}

export function IntegrityPenaltiesClient<P extends IntegrityPenaltyRecord>(
  props: IntegrityPenaltiesClientProps<P>,
) {
  return (
    <IntegrityPenaltiesClientInner
      key={props.initialStatus}
      {...props}
    />
  )
}

function IntegrityPenaltiesClientInner<P extends IntegrityPenaltyRecord>(
  props: IntegrityPenaltiesClientProps<P>,
) {
  const t = useTranslations()
  const state = useIntegrityPenalties({
    endpoint: props.endpoint,
    available: props.available,
    getById: props.getById,
    initialData: props.initialData,
    initialStatus: props.initialStatus,
    listPath: props.penaltiesPath,
    paginationParams: props.paginationParams,
    revoke: props.revoke,
    scopeGuard: props.scopeGuard,
  })

  return (
    <div className='space-y-6'>
      <IntegrityPenaltiesHeader
        domain={props.domain}
        flagsTestId={
          props.domain === 'vote' ? 'vote-integrity-flags-tab' : 'report-integrity-flags-tab'
        }
        flagsPath={props.flagsPath}
        headingTestId={
          props.domain === 'vote'
            ? 'vote-integrity-penalties-heading'
            : 'report-integrity-penalties-heading'
        }
        isPending={state.isPending}
        onRefresh={state.handleRefresh}
        onStatusChange={state.handleStatusChange}
        penaltiesPath={props.penaltiesPath}
        selectedStatus={state.selectedStatus}
        statusFilterTestId={
          props.domain === 'vote'
            ? 'vote-integrity-penalties-status-filter'
            : 'report-integrity-penalties-status-filter'
        }
      />
      <IntegrityPenaltiesTable
        domain={props.domain}
        initialStatus={props.initialStatus}
        multiplier={props.multiplier}
        state={state}
      />
      {!state.scopeAvailable ? (
        <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
          {props.domain === 'report'
            ? t('extracted.flags.integrityPenalties.reportUnavailable_482f0f19')
            : t('extracted.flags.integrityPenalties.scopeUnavailable_d7b51aa2')}
        </div>
      ) : null}
      {state.fetchError ? (
        <div className='flex flex-col items-center gap-2 py-4'>
          <p className='text-sm text-destructive'>
            {t('extracted.flags.integrityPenalties.failedToLoadMore_e1499d61')}
          </p>
          <Button
            variant='outline'
            size='touchSm'
            onClick={() => {
              state.clearError()
              void state.loadMore()
            }}
          >
            {t('extracted.flags.integrityPenalties.retry_942087cc')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
