// A node WAL fingerprint and `query:wal-aggregate` are one query-wide threshold. The paired gate
// treats a transition between them as repeated pressure. A missing repeat stays fail-closed, and a
// different node does not confirm a node fingerprint: checkpoint images can land on different nodes.

export function isCheckpointSensitiveWalFingerprint(fingerprint: string): boolean {
  return fingerprint === 'query:wal-aggregate' || fingerprint.endsWith(':wal')
}

export function confirmsRepeatedWalFingerprint(
  fingerprint: string,
  repeated: ReadonlySet<string> | undefined,
): boolean {
  if (repeated === undefined || repeated.has(fingerprint)) return true
  return fingerprint === 'query:wal-aggregate'
    ? [...repeated].some(entry => entry.endsWith(':wal'))
    : repeated.has('query:wal-aggregate')
}
