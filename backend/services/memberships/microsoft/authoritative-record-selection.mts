import {
  collectMatchedRecords,
  selectPreferredRecord,
  type AuthoritativeRecordSelectionOptions,
} from './authoritative-record-candidates.mts'

type Selection =
  | {
      kind: 'matched'
      collection: AuthoritativeRecordSelectionOptions['collections'][number]
      recurrence: AuthoritativeRecordSelectionOptions['recurrences'][number]
    }
  | { kind: 'lag' | 'missing' }

/** Selects the newest corroborated product while preserving cross-API propagation lag. */
export function selectAuthoritativeMicrosoftStoreRecords(
  options: AuthoritativeRecordSelectionOptions,
): Selection {
  const requestedRecurrenceId = options.recurrenceId ?? null
  const candidates = collectMatchedRecords(options, requestedRecurrenceId)
  const selected = selectPreferredRecord(options, candidates.records)
  if (!selected) return { kind: candidates.crossApiLag ? 'lag' : 'missing' }
  return { kind: 'matched', ...selected }
}
