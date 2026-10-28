/**
 * Picks the entrypoint a compiled executable runs from its argv. ECS command overrides pass
 * `[...node flags, '<entrypoint>.mts', ...arguments]`, so everything up to the entrypoint is
 * dropped and the entrypoint reads its own arguments from `argv.slice(2)` as it does under Node.
 */
export function selectExecutableEntrypoint(
  argv: readonly string[],
  entrypoints: readonly string[],
  fallback: string,
): { entrypoint: string; argv: string[] } {
  const index = argv.findIndex((arg, i) => i >= 2 && entrypoints.includes(arg))
  if (index === -1) return { entrypoint: fallback, argv: [...argv] }
  return { entrypoint: argv[index]!, argv: [...argv.slice(0, 2), ...argv.slice(index + 1)] }
}
