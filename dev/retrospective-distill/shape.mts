import { isDeepStrictEqual } from 'node:util'
import type { Session, SessionEntry } from 'agent-blackboard'
import { validateFeedbackEnvelope } from 'vouchington-tooling/agent-blackboard'

import { isCheckpointEntry } from '../journal-checkpoint/checkpoint-entry.mts'
import { isRetrospectiveEntry } from '../retrospective-save/retrospective-entry.mts'

// Mirrors .agents/skills/retrospective-distill/SKILL.md's classification paragraph exactly —
// keep these two in step; a mismatch means an inspector's hand classification and this command's
// output disagree on the same session.
//
// zero-entry-child / zero-entry-root name a session-topology fact (whether parentSessionId is
// set), not a completion signal: a delegated child that dies mid-task is a zero-entry-child
// session too, indistinguishable here from one that finished its bounded assignment cleanly (see
// .agents/skills/blackboard/SKILL.md's child session_ensure handshake). Docs referencing this
// split must not imply "child" means "completed normally".
export type SessionShape =
  | 'retrospective'
  | 'entry-type-unresolved'
  | 'checkpoint-only'
  | 'journal-only'
  | 'zero-entry-child'
  | 'zero-entry-root'

export type SessionClassification = {
  sessionId: string
  shape: SessionShape
  eligible: boolean
  quarantine?: { entryCount: number; reasons: string[] }
  duplicateEntryCount?: number
}

export type DistillCutoffs = {
  retroCutoff: string
  sessionCutoff: string
}

function quarantineReason(entry: SessionEntry): string | undefined {
  if (entry.data.type !== 'journal' && entry.data.type !== 'retrospective')
    return 'unknown-entry-type'
  if (entry.data.schemaVersion !== undefined) {
    try {
      validateFeedbackEnvelope(entry.data)
    } catch {
      return 'invalid-feedback-envelope'
    }
  }
  return undefined
}

function hasUnresolvedType(entry: SessionEntry): boolean {
  return quarantineReason(entry) !== undefined
}

function classifyShape(session: Session, entries: SessionEntry[]): SessionShape {
  if (entries.some(hasUnresolvedType)) return 'entry-type-unresolved'
  if (entries.some(isRetrospectiveEntry)) return 'retrospective'
  if (entries.length === 0) {
    // Loose equality on purpose: a partition record missing `parentSessionId` entirely (this
    // reader trusts the file on disk and does not re-validate every field against the Session
    // interface — see partition-records.mts) must fall to zero-entry-root. This is a
    // topology and capture-gap signal, never evidence of crash or clean completion.
    // `=== null` would silently misroute `undefined` into the
    // wrong, discarded bucket.
    return session.parentSessionId == null ? 'zero-entry-root' : 'zero-entry-child'
  }
  return entries.every(isCheckpointEntry) ? 'checkpoint-only' : 'journal-only'
}

function newestRetrospectiveAt(entries: SessionEntry[]): string | undefined {
  let newest: string | undefined
  for (const entry of entries) {
    if (!isRetrospectiveEntry(entry)) continue
    if (newest === undefined || Date.parse(entry.createdAt) > Date.parse(newest))
      newest = entry.createdAt
  }
  return newest
}

// Mirrors SKILL.md's eligibility rule exactly:
// (has a retrospective entry AND retroAt < retroCutoff) OR (lastActive < sessionCutoff).
// An entry-type-unresolved session gets no issue-filing or archival pass "this run, regardless of
// its age" (SKILL.md), so it is never eligible here — that check short-circuits before the formula.
function isEligible(
  session: Session,
  entries: SessionEntry[],
  shape: SessionShape,
  cutoffs: DistillCutoffs,
): boolean {
  if (shape === 'entry-type-unresolved') return false
  const retroAt = newestRetrospectiveAt(entries)
  const staleRetro = retroAt !== undefined && Date.parse(retroAt) < Date.parse(cutoffs.retroCutoff)
  const lastActive = session.lastEntryAt ?? session.createdAt
  const staleSession = Date.parse(lastActive) < Date.parse(cutoffs.sessionCutoff)
  return staleRetro || staleSession
}

function normalizeSourceEvents(entries: SessionEntry[]) {
  const events = new Map<string, SessionEntry>()
  const unique: SessionEntry[] = []
  let duplicateEntryCount = 0
  let conflictCount = 0
  for (const entry of entries) {
    if (entry.data.schemaVersion !== 1 || quarantineReason(entry) !== undefined) {
      unique.push(entry)
      continue
    }
    const key = `${entry.sessionId}:${entry.data.sourceEventId}`
    const existing = events.get(key)
    if (!existing) {
      events.set(key, entry)
      unique.push(entry)
      continue
    }
    if (!isDeepStrictEqual(existing.data, entry.data)) {
      conflictCount++
      continue
    }
    duplicateEntryCount++
    // At-least-once replay does not postpone a source event's distillation age.
    if (Date.parse(entry.createdAt) < Date.parse(existing.createdAt)) {
      unique[unique.indexOf(existing)] = entry
      events.set(key, entry)
    }
  }
  return { unique, duplicateEntryCount, conflictCount }
}

export function classifySession(
  session: Session,
  entries: SessionEntry[],
  cutoffs: DistillCutoffs,
): SessionClassification {
  const { unique, duplicateEntryCount, conflictCount } = normalizeSourceEvents(entries)
  const shape = conflictCount ? 'entry-type-unresolved' : classifyShape(session, unique)
  const reasons = entries
    .map(quarantineReason)
    .filter((reason): reason is string => reason !== undefined)
  for (let index = 0; index < conflictCount; index++) reasons.push('conflicting-source-event')
  return {
    sessionId: session.id,
    shape,
    eligible: isEligible(session, unique, shape, cutoffs),
    ...(duplicateEntryCount ? { duplicateEntryCount } : {}),
    ...(reasons.length === 0
      ? {}
      : { quarantine: { entryCount: reasons.length, reasons: [...new Set(reasons)].sort() } }),
  }
}
