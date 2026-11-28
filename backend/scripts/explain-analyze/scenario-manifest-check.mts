export function assertScenarioManifest(
  completed: readonly string[],
  expected: readonly string[],
): void {
  const completedSet = new Set(completed)
  const expectedSet = new Set(expected)
  const missing = expected.filter(id => !completedSet.has(id))
  const unexpected = completed.filter(id => !expectedSet.has(id))
  const duplicates = completed.filter((id, index) => completed.indexOf(id) !== index)
  if (missing.length > 0 || unexpected.length > 0 || duplicates.length > 0) {
    throw new Error(
      `EXPLAIN scenario manifest mismatch; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}] duplicates=[${[...new Set(duplicates)].join(', ')}]`,
    )
  }
}
