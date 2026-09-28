// The published worker-exit formatter classifies errors itself. This walk stays local because the
// CI block still prints Vouchington's process-resource line around the serialized error.
const diagnosticPropertyNames = ['name', 'message', 'stack', 'code', 'type', 'workerError', 'cause']

export function serializeDiagnosticsError(
  error: unknown,
  seen = new Set<unknown>(),
): Record<string, unknown> {
  if (error == null || typeof error !== 'object') return { value: error }
  if (seen.has(error)) return { circular: true }

  const source = error as Record<string, unknown>
  seen.add(error)
  const output: Record<string, unknown> = {}
  for (const key of diagnosticKeys(source)) {
    if (!(key in source)) continue
    const value = source[key]
    output[key] =
      value == null || typeof value !== 'object' ? value : serializeDiagnosticsError(value, seen)
  }
  return output
}

function diagnosticKeys(source: Record<string, unknown>): Set<string> {
  return new Set([...Object.keys(source), ...diagnosticPropertyNames])
}
