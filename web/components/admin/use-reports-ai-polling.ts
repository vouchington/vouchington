'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getReportJudgementRun } from '@/lib/api/client/reports'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import type { AdminModerationReport } from './reports-client-types'

export function useReportsAiPolling(reports: AdminModerationReport[], enabled: boolean) {
  const router = useRouter()
  const [rerunRuns, setRerunRuns] = useState<Record<string, string>>({})
  const rerunRunsRef = useRef(rerunRuns)
  const [rerunTimedOut, setRerunTimedOut] = useState(false)
  const [rerunFailed, setRerunFailed] = useState(false)
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
      const outcomes = await Promise.all(
        activeReruns.map(async ([reportId, runId]) => {
          try {
            const result = await getReportJudgementRun(reportId, runId)
            if (result.run_id !== runId || result.status === 'active') return null
            if (result.status === 'succeeded' && !result.judgement_id) return null
            return { reportId, runId, status: result.status }
          } catch {
            return null
          }
        }),
      )
      const terminalRuns = outcomes.filter(
        (outcome): outcome is NonNullable<typeof outcome> =>
          outcome !== null && rerunRunsRef.current[outcome.reportId] === outcome.runId,
      )
      if (terminalRuns.length > 0) {
        const terminalByReport = new Map(
          terminalRuns.map(({ reportId, runId }) => [reportId, runId]),
        )
        const next = Object.fromEntries(
          Object.entries(rerunRunsRef.current).filter(
            ([reportId, runId]) => terminalByReport.get(reportId) !== runId,
          ),
        )
        rerunRunsRef.current = next
        setRerunRuns(next)
        if (terminalRuns.some(({ status }) => status === 'failed')) setRerunFailed(true)
        if (terminalRuns.some(({ status }) => status === 'expired')) setRerunTimedOut(true)
        if (terminalRuns.some(({ status }) => status === 'succeeded')) router.refresh()
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
      const currentRunExpired = Object.entries(rerunRunsRef.current).some(([reportId, runId]) =>
        expired.has(`rerun:${reportId}:${runId}`),
      )
      if (currentRunExpired) setRerunTimedOut(true)
    },
  )

  return {
    pendingRerunEntities,
    pollingTimedOut,
    rerunTimedOut,
    rerunFailed,
    clearRerunTimeout: () => {
      setRerunTimedOut(false)
      setRerunFailed(false)
    },
    markRerun: (reportId: string, runId: string) => {
      const next = { ...rerunRunsRef.current, [reportId]: runId }
      rerunRunsRef.current = next
      setRerunRuns(next)
    },
  }
}
