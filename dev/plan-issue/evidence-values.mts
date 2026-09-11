const ABSENCE_TERM = String.raw`(?:n/?a|none|not applicable)`
const BARE_ABSENCE_RE = new RegExp(String.raw`^${ABSENCE_TERM}[.!?]?$`, 'i')
const JUSTIFIED_ABSENCE_RE = new RegExp(
  String.raw`^${ABSENCE_TERM}(?:(?:,\s*|\s+)(?:because|as|since)\b\s+|[:;—-]\s*)(\S.*)$`,
  'i',
)
const EMBEDDED_TEMPLATE_RE =
  /(?:chosen or rejected because|no[- ]change:|reuse:|materially different:)\s*(?:…|\.{3}|<[^>]+>)/i
const STANDALONE_FILLER_RE = /^(?:…|\.{3}|<[^>]+>\.?)$/i
const TRAILING_UNRESOLVED_MARKER_RE =
  /(?:^|[\s:;—-])(?:tbd|todo)(?:\s+(?:later|pending))?\s*[.!?]?$/i

function isAbsenceValue(value: string): boolean {
  return BARE_ABSENCE_RE.test(value) || JUSTIFIED_ABSENCE_RE.test(value)
}

export function isMeaningfulEvidence(value: string): boolean {
  const normalized = value.trim()
  return (
    normalized !== '' &&
    !isAbsenceValue(normalized) &&
    !EMBEDDED_TEMPLATE_RE.test(normalized) &&
    !TRAILING_UNRESOLVED_MARKER_RE.test(normalized) &&
    !STANDALONE_FILLER_RE.test(normalized)
  )
}

export function isMeaningfulOrJustifiedAbsence(value: string): boolean {
  const normalized = value.trim()
  const absence = JUSTIFIED_ABSENCE_RE.exec(normalized)
  return isMeaningfulEvidence(normalized) || (absence !== null && isMeaningfulEvidence(absence[1]))
}
