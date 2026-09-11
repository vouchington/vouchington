export type ReportIntegrityJobs = 'processReportIntegrityCheck' | 'backfill_report_integrity'

export type ProcessReportIntegrityCheckData = {
  entityType: string
  entityId: string
}

export type ReportIntegrityJobData =
  | { name: 'processReportIntegrityCheck'; data: ProcessReportIntegrityCheckData }
  | { name: 'backfill_report_integrity'; data: Record<string, never> }
