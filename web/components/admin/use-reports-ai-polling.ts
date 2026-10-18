'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import type { AdminModerationReport } from './reports-client-types'

export function useReportsAiPolling(reports: AdminModerationReport[], enabled: boolean) {
  const router = useRouter()
  const [rerunBefore, setRerunBefore] = useState<Record<string, string | null>>({})
  const [rerunTimedOut, setRerunTimedOut] = useState(false)
  const pendingJudgement = reports.some(
    report => isOrdinaryPendingReport(report) && !report.judgement,
  )
  const pendingRerunEntities = new Set<string>()
  const pendingRerunKeys: string[] = []
  for (const report of reports) {
    if (
      Object.hasOwn(rerunBefore, report.id) &&
      (report.judgement?.id ?? null) === rerunBefore[report.id]
    ) {
      pendingRerunEntities.add(`${report.entity_type}:${report.entity_id}`)
      pendingRerunKeys.push(`rerun:${report.id}:${rerunBefore[report.id] ?? 'new'}`)
    }
  }
  const pollingTimedOut = usePendingAiRefresh(
    enabled && (pendingJudgement || pendingRerunEntities.size > 0),
    () => router.refresh(),
    [
      ...reports.flatMap(report =>
        isOrdinaryPendingReport(report) && !report.judgement ? [report.id] : [],
      ),
      ...pendingRerunKeys,
    ].join('|'),
    expiredKeys => {
      const expired = new Set(expiredKeys)
      if (![...expired].some(key => key.startsWith('rerun:'))) return
      setRerunBefore(current =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([id, before]) => !expired.has(`rerun:${id}:${before ?? 'new'}`),
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
    markRerun: (reportId: string, before: string | null) =>
      setRerunBefore(current => ({ ...current, [reportId]: before })),
  }
}
