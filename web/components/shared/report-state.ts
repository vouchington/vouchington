import type { ReportableEntityType } from '@/lib/api/client/reports'

export const REPORT_SUBMITTED_EVENT = 'voucha:report-submitted'

export function getReportStorageKey(entityType: ReportableEntityType, entityId: string) {
  return `report:${entityType}:${entityId}`
}

export function getReportSubmittedKey(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null
  const detail = event.detail as unknown
  if (typeof detail !== 'object' || detail === null || !('key' in detail)) return null
  return typeof detail.key === 'string' ? detail.key : null
}
