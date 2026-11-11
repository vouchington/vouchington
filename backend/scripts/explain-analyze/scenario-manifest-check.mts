const SHARD_FILE = 'explain-shard-scenario-ids.json'

// A shard's ids come from the runner order cut into segments, but the ids themselves are
// hand-listed in SHARD_FILE. Name the edit when the two disagree.
function shardHint(
  shard: string | undefined,
  missing: readonly string[],
  unexpected: readonly string[],
): string {
  if (shard === undefined || shard === 'partition' || shard === 'hn-scale') return ''
  const hints: string[] = []
  if (unexpected.length > 0)
    hints.push(
      shard === 'main'
        ? `[${unexpected.join(', ')}] ran in main but ${SHARD_FILE} declares them for another shard; move or remove them there`
        : `add [${unexpected.join(', ')}] to ${SHARD_FILE} under "${shard}"`,
    )
  if (missing.length > 0)
    hints.push(
      shard === 'main'
        ? `if [${missing.join(', ')}] now run in a later segment, add them to ${SHARD_FILE} under that shard`
        : `if the runners for [${missing.join(', ')}] moved to another segment, update ${SHARD_FILE}`,
    )
  return hints.length > 0 ? `; fix: ${hints.join('; ')}` : ''
}

export function assertScenarioManifest(
  completed: readonly string[],
  expected: readonly string[],
  shard?: string,
): void {
  const completedSet = new Set(completed)
  const expectedSet = new Set(expected)
  const missing = expected.filter(id => !completedSet.has(id))
  const unexpected = completed.filter(id => !expectedSet.has(id))
  const duplicates = completed.filter((id, index) => completed.indexOf(id) !== index)
  if (missing.length > 0 || unexpected.length > 0 || duplicates.length > 0) {
    throw new Error(
      `EXPLAIN scenario manifest mismatch; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}] duplicates=[${[...new Set(duplicates)].join(', ')}]${shardHint(shard, missing, unexpected)}`,
    )
  }
}
