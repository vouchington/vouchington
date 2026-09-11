import createError from 'http-errors'

export interface InboundActivity {
  id: string
  type: string
  actor: string
  object: unknown
}

// Parses and minimally validates an inbound ActivityPub activity body. Only the fields the
// dispatcher and replay-dedup ledger actually read (`id`, `type`, `actor`) are required —
// everything else (including `object`) is passed through untyped for dispatchInboundActivity to
// interpret per activity type. Throws a 400 http-error on malformed JSON or missing/invalid
// required fields; the inbox route lets this propagate to the standard error handler.
export function parseInboundActivity(rawBody: Buffer): InboundActivity {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody.toString('utf8'))
  } catch {
    throw createError(400, 'Malformed JSON body')
  }
  if (!isPlainObject(parsed)) throw createError(400, 'Activity body must be a JSON object')

  const { id, type, actor, object } = parsed
  if (!isNonEmptyString(id)) throw createError(400, 'Activity is missing a valid "id"')
  if (!isNonEmptyString(type)) throw createError(400, 'Activity is missing a valid "type"')
  if (!isNonEmptyString(actor)) throw createError(400, 'Activity is missing a valid "actor"')

  return { id, type, actor, object }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
