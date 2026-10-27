import type { PoolClient } from '@data-stores/psql'

/** Retryable. glide-mq backs off while the replica's source version is older than the writer's. */
export class ReplicaBehindError extends Error {
  constructor() {
    super(
      'Blocklist replica source version is behind the writer version read before the membership copy',
    )
    this.name = 'ReplicaBehindError'
  }
}

export type ReadReplicaSourceVersion = (
  client: PoolClient,
  sourceId: string,
  writerVersion: string | null,
) => Promise<string | null>

/** True when `candidate` is an older 32-bit xid than `baseline`, including wraparound. */
function xidPrecedes(candidate: string, baseline: string): boolean {
  const diff = (BigInt(candidate) - BigInt(baseline)) & 0xffffffffn
  const signed = diff > 0x7fffffffn ? diff - 0x100000000n : diff
  return signed < 0n
}

/**
 * The replica is behind when its source row is missing or its xmin precedes the writer's.
 * A newer replica xmin is a commit that landed after the writer read; the copy may proceed.
 */
export function replicaVersionIsBehind(
  replicaVersion: string | null,
  writerVersion: string | null,
): boolean {
  if (writerVersion === null) return replicaVersion !== null
  if (replicaVersion === null) return true
  if (replicaVersion === writerVersion) return false
  return xidPrecedes(replicaVersion, writerVersion)
}
