import {
  statusFromGapState,
  statusFromMatrixCell,
  type ClientFeatureStatus,
} from './client-parity-status.mts'

export type TableKind = 'A' | 'B' | 'C'
type StatusKind = ClientFeatureStatus

export function classifyTableKind(cells: string[]): TableKind | undefined {
  if (
    cells[0] === 'Capability' &&
    cells[1] === 'Web' &&
    cells[2] === 'Swift' &&
    cells[3] === '.NET'
  )
    return 'A'
  if (cells[0] === '#' && cells[1].startsWith('Domain')) return 'B'
  if (
    cells[0] === '#' &&
    cells[2] === 'Feature ID' &&
    cells[3] === 'Client(s)' &&
    cells[4] === 'Current state'
  )
    return 'C'
  return undefined
}

export function statusFromTableRow(kind: TableKind, cells: string[]): StatusKind | undefined {
  if (kind === 'C') return statusFromGapState(cells[4] ?? '')
  const nativeCells =
    kind === 'A' ? [cells[2] ?? '', cells[3] ?? ''] : [cells[3] ?? '', cells[4] ?? '']
  const nativeStatuses = nativeCells.map(statusFromMatrixCell)
  if (nativeStatuses.includes('none')) return 'none'
  if (nativeStatuses.includes('present')) return 'present'
  if (nativeStatuses.includes('plumb')) return 'plumb'
  if (nativeStatuses.includes('read')) return 'read'
  if (nativeStatuses.includes('partial')) return 'partial'
  return nativeStatuses.every(status => status === 'full') ? 'full' : 'partial'
}
