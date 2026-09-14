import sql from 'sql-template-strings'
import { maybeCaptureQuery } from '@data-stores/psql/query-capture'
import type { QueryInput } from '@data-stores/psql/types'

export function captureStringQuery(): void {
  maybeCaptureQuery('/* fromString */ SELECT $1', [1])
}

export function captureSqlTemplateQuery(): void {
  maybeCaptureQuery(sql`/* fromSql */ SELECT ${2}`)
}

export function captureUnsupportedQueryInput(): void {
  maybeCaptureQuery({} as QueryInput)
}

export function captureQueryAfterDisable(): void {
  maybeCaptureQuery('/* afterDisable */ SELECT 1')
}

export function captureQueryBeforeStop(): void {
  maybeCaptureQuery('/* capturedBeforeStop */ SELECT $1', [1])
}

export function captureQueryAfterStop(): void {
  maybeCaptureQuery('/* capturedAfterStop */ SELECT 2')
}

export function captureUncloneableValuesQuery(values: readonly unknown[]): void {
  maybeCaptureQuery('/* cloneFailure */ SELECT $1', values)
}
