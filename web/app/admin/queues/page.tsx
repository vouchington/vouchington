'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  fetchBackfills,
  fetchScheduledJobs,
  triggerBackfill,
  triggerScheduledJob,
  type Backfill,
  type ScheduledJob,
} from '@/lib/api/client/mq'
import { AiAgentsSection } from './ai-agents-section'
import { KagiSection } from './kagi-section'
import { BackfillTriggerDialog } from './backfill-trigger-dialog'
import { BackfillsTable } from './backfills-table'
import { ScheduledJobTriggerDialog } from './scheduled-job-trigger-dialog'
import { ScheduledJobsHeader } from './scheduled-jobs-header'
import { ScheduledJobsTable } from './scheduled-jobs-table'
import {
  ScheduledJobsErrorAlert,
  ScheduledJobsErrorState,
  ScheduledJobsLoadingState,
} from './scheduled-jobs-load-state'
import { useTranslations } from '@/lib/i18n/use-translations'
import { queuesPageInitialState, queuesPageReducer } from './queues-model'

export const dynamic = 'force-dynamic'
const REFRESH_INTERVAL_MS = 30_000

export default function QueuesPage() {
  const t = useTranslations()
  const [state, dispatch] = useReducer(queuesPageReducer, queuesPageInitialState)
  const loadDataPendingRef = useRef(false)

  const loadData = useCallback(async () => {
    if (loadDataPendingRef.current) return
    loadDataPendingRef.current = true
    dispatch({ loading: true })
    try {
      dispatch({ error: null })
      const [jobsResult, backfillsResult] = await Promise.all([
        fetchScheduledJobs(),
        fetchBackfills().catch(() => ({ backfills: [] as Backfill[] })),
      ])
      dispatch({
        jobs: jobsResult.jobs,
        backfills: backfillsResult.backfills,
      })
    } catch (error) {
      dispatch({
        error:
          error instanceof Error
            ? error.message
            : t('extracted.queues.page.failedToLoadScheduledJobs_196d47c6'),
      })
    } finally {
      loadDataPendingRef.current = false
      dispatch({ loading: false })
    }
  }, [t])

  useEffect(() => {
    void loadData()
    const refreshInterval = setInterval(() => {
      void loadData()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(refreshInterval)
  }, [loadData])

  async function handleTrigger(job: ScheduledJob) {
    dispatch(s => ({ actionLoading: { ...s.actionLoading, [job.id]: true } }))
    try {
      await triggerScheduledJob(job.id)
      onSuccess(
        t('extracted.queues.page.jobDescriptionTriggered_6a310e54', {
          description: job.description,
        }),
      )
    } catch (error) {
      onError(error, {
        fallback: t('extracted.queues.page.failedToTriggerDescription_f09acb12', {
          description: job.description,
        }),
        tags: { form: 'admin-job-trigger' },
      })
    } finally {
      dispatch(s => ({ actionLoading: { ...s.actionLoading, [job.id]: false } }))
    }
  }

  async function confirmTrigger() {
    if (!state.pendingJob) return
    const job = state.pendingJob
    dispatch({ pendingJob: null })
    await handleTrigger(job)
  }

  async function handleTriggerBackfill(backfill: Backfill) {
    dispatch(s => ({ actionLoading: { ...s.actionLoading, [backfill.id]: true } }))
    try {
      await triggerBackfill(backfill.id)
      onSuccess(
        t('extracted.queues.page.backfillDescriptionEnqueued_f822b605', {
          description: backfill.description,
        }),
      )
    } catch (error) {
      onError(error, {
        fallback: t('extracted.queues.page.failedToTriggerBackfillDescription_677e1efb', {
          description: backfill.description,
        }),
        tags: { form: 'admin-backfill-trigger' },
      })
    } finally {
      dispatch(s => ({ actionLoading: { ...s.actionLoading, [backfill.id]: false } }))
    }
  }

  async function confirmTriggerBackfill() {
    if (!state.pendingBackfill) return
    const backfill = state.pendingBackfill
    dispatch({ pendingBackfill: null })
    await handleTriggerBackfill(backfill)
  }

  if (state.loading && state.jobs.length === 0) {
    return (
      <>
        <ScheduledJobsLoadingState />
        <AiAgentsSection />
        <KagiSection />
      </>
    )
  }

  if (state.error && state.jobs.length === 0) {
    return (
      <>
        <ScheduledJobsErrorState error={state.error} />
        <AiAgentsSection />
        <KagiSection />
      </>
    )
  }

  return (
    <div>
      <ScheduledJobsHeader
        loading={state.loading}
        onRefresh={loadData}
      />

      {state.error && (
        <div className='mb-6'>
          <ScheduledJobsErrorAlert error={state.error} />
        </div>
      )}

      <ScheduledJobsTable
        actionLoading={state.actionLoading}
        jobs={state.jobs}
        onPendingJobChange={j => dispatch({ pendingJob: j })}
      />
      <ScheduledJobTriggerDialog
        onConfirm={confirmTrigger}
        onPendingJobChange={j => dispatch({ pendingJob: j })}
        pendingJob={state.pendingJob}
      />

      {state.backfills.length > 0 && (
        <div className='mt-8'>
          <BackfillsTable
            actionLoading={state.actionLoading}
            backfills={state.backfills}
            onPendingBackfillChange={b => dispatch({ pendingBackfill: b })}
          />
          <BackfillTriggerDialog
            onConfirm={confirmTriggerBackfill}
            onPendingBackfillChange={b => dispatch({ pendingBackfill: b })}
            pendingBackfill={state.pendingBackfill}
          />
        </div>
      )}

      <AiAgentsSection />
      <KagiSection />
    </div>
  )
}
