import onError from '@modules/on-error'
import type { ShutdownError } from '@vouchington/server-utils/graceful-shutdown'

interface TaggedError extends Error {
  tags?: Record<string, string | number | boolean> | null
}

// A ShutdownError only wraps the failure with where it happened. Sentry gets the original error,
// grouped by its own stack, and the resource, phase and signal become tags to filter on.
export function reportShutdownError(error: ShutdownError): void {
  const cause = error.cause
  // A frozen or sealed Error rejects the tags write, so it is wrapped instead of mutated.
  const original: TaggedError =
    cause instanceof Error && Object.isExtensible(cause)
      ? cause
      : new Error(cause instanceof Error ? cause.message : String(cause), { cause: error })
  const existingTags = cause instanceof Error ? (cause as TaggedError).tags : undefined
  original.tags = {
    ...existingTags,
    ...(error.resource !== undefined && { shutdown_resource: error.resource }),
    ...(error.phase !== undefined && { shutdown_phase: error.phase }),
    ...(error.signal !== undefined && { shutdown_signal: error.signal }),
  }
  onError(original)
}
