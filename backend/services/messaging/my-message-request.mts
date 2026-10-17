export type MessageQuery = Record<string, unknown>
export type MessageRequestValidation = (input: {
  path?: Record<string, string | undefined>
  query?: MessageQuery
  body?: unknown
}) => void
