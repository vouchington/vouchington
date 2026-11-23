import onError from '@modules/on-error'
import type { ShutdownError } from '@vouchington/server-utils/graceful-shutdown'

interface TaggedError extends Error {
  tags?: Record<string, string | number | boolean> | null
}

const COPIED_FIELDS = ['name', 'code', 'status', 'statusCode'] as const

// Keeps the fields onError reads to decide what to ignore, since the wrapper would drop them.
function wrapCause(cause: unknown, error: ShutdownError): TaggedError {
  const wrapper: TaggedError = new Error(cause instanceof Error ? cause.message : String(cause), {
    cause: error,
  })
  if (cause instanceof Error) {
    for (const field of COPIED_FIELDS) {
      const value = (cause as unknown as Record<string, unknown>)[field]
      if (value !== undefined) Object.assign(wrapper, { [field]: value })
    }
  }
  return wrapper
}

// A ShutdownError only wraps the failure with where it happened. Sentry gets the original error,
// except a frozen cause, which is reported through a wrapper with the original reachable as `.cause`.
// The resource, phase and signal become tags to filter on.
export function reportShutdownError(error: ShutdownError): void {
  const cause = error.cause
  // A frozen or sealed Error rejects the tags write, so it is wrapped instead of mutated.
  const original: TaggedError =
    cause instanceof Error && Object.isExtensible(cause) ? cause : wrapCause(cause, error)
  const existingTags = cause instanceof Error ? (cause as TaggedError).tags : undefined
  original.tags = {
    ...existingTags,
    ...(error.resource !== undefined && { shutdown_resource: error.resource }),
    ...(error.phase !== undefined && { shutdown_phase: error.phase }),
    ...(error.signal !== undefined && { shutdown_signal: error.signal }),
  }
  onError(original)
}
