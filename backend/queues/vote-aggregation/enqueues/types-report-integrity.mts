export type ProcessReportIntegrityCheckData = {
  entityType: string
  entityId: string
}

export type BackfillReportIntegrityData = {
  afterReportId?: string
  reportIds?: readonly string[]
}
