/** Strict boundary for advisory submission guidance returned by a model. */
export function isCopyrightSubmissionGuidance(
  value: unknown,
  checklistKey: 'elements' | 'criteria',
  itemKey: 'element' | 'criterion',
  checklist: readonly string[],
  riskKinds: readonly string[],
): boolean {
  if (!hasExactKeys(value, ['summary', checklistKey, 'risk_notes'])) return false
  if (!isText(value.summary, 2000)) return false
  const items = value[checklistKey]
  if (!Array.isArray(items) || items.length !== checklist.length) return false
  const allowed = new Set(checklist)
  const seen = new Set<string>()
  for (const item of items) {
    if (!hasExactKeys(item, [itemKey, 'status', 'gap'])) return false
    const name = item[itemKey]
    if (typeof name !== 'string' || !allowed.has(name) || seen.has(name)) return false
    seen.add(name)
    if (item.status !== 'present' && item.status !== 'missing' && item.status !== 'unclear')
      return false
    if (item.gap !== null && !isText(item.gap, 1000)) return false
  }
  const notes = value.risk_notes
  if (!Array.isArray(notes) || notes.length > 6) return false
  const allowedRiskKinds = new Set(riskKinds)
  const seenNotes = new Set<string>()
  for (const note of notes) {
    if (!hasExactKeys(note, ['kind', 'note'])) return false
    if (typeof note.kind !== 'string' || !allowedRiskKinds.has(note.kind)) return false
    if (!isText(note.note, 1000)) return false
    const key = `${note.kind}:${note.note}`
    if (seenNotes.has(key)) return false
    seenNotes.add(key)
  }
  return true
}

function hasExactKeys<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}
