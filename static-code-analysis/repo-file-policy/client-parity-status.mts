export type ClientFeatureStatus = 'full' | 'partial' | 'read' | 'plumb' | 'none' | 'present'

const CURRENT_STATE_CLOSED_RE = /^(closed by|closed\b)/i
function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export function statusFromMatrixCell(cell: string): ClientFeatureStatus | undefined {
  const value = normalize(cell)
  if (value.includes('🔴') || /\bnone\b/.test(value)) return 'none'
  if (value.includes('(present)') || /\bpresent\b/.test(value)) return 'present'
  if (value.includes('(plumb)') || /\bplumb\b/.test(value)) return 'plumb'
  if (value.includes('(read)') || /\bread-only\b/.test(value) || /\bread only\b/.test(value))
    return 'read'
  if (value.includes('(partial)') || /\bpartial\b/.test(value)) return 'partial'
  if (value.includes('🟢') || /\bfull\b/.test(value)) return 'full'
  return undefined
}

export function statusFromGapState(cell: string): ClientFeatureStatus | undefined {
  const value = normalize(cell)
  const declared = /^(none|plumb|present|read-only|read only|partial)\b/.exec(value)?.[1]
  if (declared === 'read-only' || declared === 'read only') return 'read'
  if (
    declared === 'none' ||
    declared === 'plumb' ||
    declared === 'present' ||
    declared === 'partial'
  )
    return declared
  if (CURRENT_STATE_CLOSED_RE.test(value)) return 'full'
  return undefined
}

export function aggregateFeatureStatuses(
  statuses: readonly ClientFeatureStatus[],
): ClientFeatureStatus | undefined {
  const first = statuses[0]
  if (!first) return undefined
  return statuses.every(status => status === first) ? first : 'partial'
}
