import onError from '@modules/on-error'
import type { ShutdownError } from '@vouchington/server-utils/graceful-shutdown'

interface TaggedError extends Error {
  tags?: Record<string, string | number | boolean> | null
}

// A ShutdownError only wraps the failure with where it happened. Sentry gets the original error,
// grouped by its own stack, and the resource, phase and signal become tags to filter on.
export function reportShutdownError(error: ShutdownError): void {
  const original: TaggedError =
    error.cause instanceof Error ? error.cause : new Error(String(error.cause), { cause: error })
  original.tags = {
    ...original.tags,
    ...(error.resource !== undefined && { shutdown_resource: error.resource }),
    ...(error.phase !== undefined && { shutdown_phase: error.phase }),
    ...(error.signal !== undefined && { shutdown_signal: error.signal }),
  }
  onError(original)
}
