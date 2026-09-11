'use client'

import { IntegrityPenaltiesClient } from '@/components/admin/integrity-penalties-client'
import {
  getReportIntegrityPenaltyClient,
  revokeReportAbusePenalty,
} from '@/lib/api/client/report-integrity'
import type {
  IntegrityPenaltyStatusFilter,
  ReportIntegrityPenaltiesResponse,
  ReportIntegrityPenalty,
} from '@/types/report-integrity'

export function ReportIntegrityPenaltiesClient({
  initialData,
  initialStatus,
  available = true,
}: {
  available?: boolean
  initialData: ReportIntegrityPenaltiesResponse
  initialStatus: IntegrityPenaltyStatusFilter
}) {
  return (
    <IntegrityPenaltiesClient<ReportIntegrityPenalty>
      domain='report'
      available={available}
      endpoint='/api/v1/report-integrity/penalties'
      flagsPath='/report-integrity/flags'
      initialData={initialData}
      initialStatus={initialStatus}
      multiplier={() => null}
      penaltiesPath='/report-integrity/penalties'
      getById={getReportIntegrityPenaltyClient}
      revoke={revokeReportAbusePenalty}
    />
  )
}
