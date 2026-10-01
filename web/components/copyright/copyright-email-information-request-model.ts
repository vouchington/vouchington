// The server refuses a needs-information message that is blank or longer than this, so staff see
// the limit before submitting rather than as a 422 after typing.
export const COPYRIGHT_EMAIL_INFORMATION_MESSAGE_MAX_LENGTH = 10_000

// The message is sent trimmed, so the trimmed length is the one the server measures.
export function copyrightEmailInformationMessageLength(message: string) {
  return message.trim().length
}

export function isValidCopyrightEmailInformationMessage(message: string) {
  const length = copyrightEmailInformationMessageLength(message)
  return length > 0 && length <= COPYRIGHT_EMAIL_INFORMATION_MESSAGE_MAX_LENGTH
}
