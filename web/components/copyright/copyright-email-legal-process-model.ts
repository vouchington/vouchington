// The server refuses a legal-process reason that is blank or longer than this, so staff see the
// limit before submitting rather than as a 422 after typing.
export const COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH = 1_000

// The reason is sent trimmed, so the trimmed length is the one the server measures.
export function copyrightEmailLegalProcessReasonLength(reason: string) {
  return reason.trim().length
}

export function isValidCopyrightEmailLegalProcessReason(reason: string) {
  const length = copyrightEmailLegalProcessReasonLength(reason)
  return length > 0 && length <= COPYRIGHT_EMAIL_LEGAL_PROCESS_REASON_MAX_LENGTH
}
