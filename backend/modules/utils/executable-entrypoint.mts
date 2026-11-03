const MAX_RECEIVED_LENGTH = 80

/**
 * Picks the entrypoint a compiled executable runs from its argv. ECS command overrides pass
 * `[...node flags, '<entrypoint>.mts', ...arguments]`, so leading `-` flags are dropped and the
 * first argument after them must name a known entrypoint; the entrypoint reads its own arguments
 * from `argv.slice(2)` as it does under Node. Anything else throws, so a command written for Node
 * (such as `--eval <script>`) fails instead of starting a server that never runs it.
 */
export function selectExecutableEntrypoint(
  argv: readonly string[],
  entrypoints: readonly string[],
): { entrypoint: string; argv: string[] } {
  let index = 2
  while (argv[index]?.startsWith('-')) index++
  const received = argv[index]
  if (received === undefined || !entrypoints.includes(received)) {
    throw new Error(
      `Unknown executable command ${describeReceived(received)}; expected one of: ${entrypoints.join(', ')}`,
    )
  }
  return { entrypoint: received, argv: [...argv.slice(0, 2), ...argv.slice(index + 1)] }
}

function describeReceived(received: string | undefined): string {
  if (received === undefined) return '(none)'
  const shown = received.slice(0, MAX_RECEIVED_LENGTH)
  return JSON.stringify(received.length > shown.length ? `${shown}...` : shown)
}
