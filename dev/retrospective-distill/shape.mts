import type { Session, SessionEntry } from 'agent-blackboard'

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
}

export type DistillCutoffs = {
  retroCutoff: string
  sessionCutoff: string
}

function hasUnresolvedType(entry: SessionEntry): boolean {
  return entry.data.type !== 'journal' && !isRetrospectiveEntry(entry)
}

function classifyShape(session: Session, entries: SessionEntry[]): SessionShape {
  if (entries.some(isRetrospectiveEntry)) return 'retrospective'
  if (entries.some(hasUnresolvedType)) return 'entry-type-unresolved'
  if (entries.length === 0) {
    // Loose equality on purpose: a partition record missing `parentSessionId` entirely (this
    // reader trusts the file on disk and does not re-validate every field against the Session
    // interface — see partition-records.mts) must fall to zero-entry-root, the bucket
    // distilling.md treats as a genuine abort signal, never to zero-entry-child, the bucket it
    // treats as expected routine noise. `=== null` would silently misroute `undefined` into the
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

export function classifySession(
  session: Session,
  entries: SessionEntry[],
  cutoffs: DistillCutoffs,
): SessionClassification {
  const shape = classifyShape(session, entries)
  return { sessionId: session.id, shape, eligible: isEligible(session, entries, shape, cutoffs) }
}
