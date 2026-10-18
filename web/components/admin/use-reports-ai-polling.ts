'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getReportJudgementRun } from '@/lib/api/client/reports'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import type { AdminModerationReport } from './reports-client-types'

export function useReportsAiPolling(reports: AdminModerationReport[], enabled: boolean) {
  const router = useRouter()
  const [rerunRuns, setRerunRuns] = useState<Record<string, string>>({})
  const [rerunTimedOut, setRerunTimedOut] = useState(false)
  const visibleReportIds = new Set(reports.map(report => report.id))
  const activeReruns = Object.entries(rerunRuns).filter(([reportId]) =>
    visibleReportIds.has(reportId),
  )
  const pendingJudgement = reports.some(
    report =>
      isOrdinaryPendingReport(report) && report.automatic_judgement_enabled && !report.judgement,
  )
  const pendingRerunEntities = new Set<string>()
  const pendingRerunKeys = activeReruns.map(([reportId, runId]) => {
    const report = reports.find(candidate => candidate.id === reportId)
    if (report) pendingRerunEntities.add(`${report.entity_type}:${report.entity_id}`)
    return `rerun:${reportId}:${runId}`
  })
  const pollingTimedOut = usePendingAiRefresh(
    enabled && (pendingJudgement || pendingRerunKeys.length > 0),
    async () => {
      const completions = await Promise.all(
        activeReruns.map(async ([reportId, runId]) => {
          try {
            const result = await getReportJudgementRun(reportId, runId)
            return result.completed ? { reportId, runId } : null
          } catch {
            return null
          }
        }),
      )
      const completedRuns = completions.filter(
        (completion): completion is { reportId: string; runId: string } => completion !== null,
      )
      if (completedRuns.length > 0) {
        setRerunRuns(current => {
          const completedByReport = new Map(
            completedRuns.map(({ reportId, runId }) => [reportId, runId]),
          )
          return Object.fromEntries(
            Object.entries(current).filter(
              ([reportId, runId]) => completedByReport.get(reportId) !== runId,
            ),
          )
        })
        router.refresh()
      }
      if (pendingJudgement) router.refresh()
    },
    [
      ...reports.flatMap(report =>
        isOrdinaryPendingReport(report) && report.automatic_judgement_enabled && !report.judgement
          ? [report.id]
          : [],
      ),
      ...pendingRerunKeys,
    ].join('|'),
    expiredKeys => {
      const expired = new Set(expiredKeys)
      if (![...expired].some(key => key.startsWith('rerun:'))) return
      setRerunRuns(current =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([reportId, runId]) => !expired.has(`rerun:${reportId}:${runId}`),
          ),
        ),
      )
      setRerunTimedOut(true)
    },
  )

  return {
    pendingRerunEntities,
    pollingTimedOut,
    rerunTimedOut,
    clearRerunTimeout: () => setRerunTimedOut(false),
    markRerun: (reportId: string, runId: string) =>
      setRerunRuns(current => ({ ...current, [reportId]: runId })),
  }
}
