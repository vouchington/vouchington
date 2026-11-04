export type PostgresQueryFailureOptions = {
  command?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  requestId?: string
  matchesValues?: (values: readonly unknown[]) => boolean
}

/** Narrow a pool fault to the owned query's command and bound values. */
export function matchesPostgresQueryFailure(
  input: unknown,
  marker: string,
  options: PostgresQueryFailureOptions,
): boolean {
  const text =
    typeof input === 'string'
      ? input
      : typeof input === 'object' && input !== null && 'text' in input
        ? String(input.text)
        : ''
  const values =
    typeof input === 'object' && input !== null && 'values' in input && Array.isArray(input.values)
      ? input.values
      : []
  const target = text.trimStart()
  return (
    target.startsWith(marker) &&
    (!options.command || target.slice(marker.length).trimStart().startsWith(options.command)) &&
    (!options.matchesValues || options.matchesValues(values))
  )
}
