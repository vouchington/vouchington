import { hasExactKeys, isPreciseTimestampString } from '@modules/pagination/cursors'
import { isUUID } from '@ts-shared/utils/validation-core'
import type {
  CleanupAbandonedUploadsData,
  StagedUploadCleanupKey,
  StagedUploadCleanupSweep,
} from '../types.mts'

/** A malformed retained position must fail rather than restart a global sweep. */
export function parseCleanupAbandonedUploadsData(value: unknown): CleanupAbandonedUploadsData {
  if (!isRecord(value)) throw new Error('Upload cleanup requires an object payload')
  if (Object.keys(value).length === 0) return {}
  if (!hasExactKeys(value, ['staged']) || !isRecord(value.staged))
    throw new Error('Invalid upload cleanup payload')
  const staged = value.staged
  if (
    typeof staged.cutoff !== 'string' ||
    !isPreciseTimestampString(staged.cutoff) ||
    typeof staged.done !== 'boolean' ||
    !hasExactKeys(
      staged,
      Object.hasOwn(staged, 'after')
        ? ['cutoff', 'upper', 'after', 'done']
        : ['cutoff', 'upper', 'done'],
    )
  )
    throw new Error('Invalid staged upload cleanup snapshot')
  const upper = staged.upper === null ? null : parseKey(staged.upper)
  const after = staged.after === undefined ? undefined : parseKey(staged.after)
  if (
    (!upper && (!staged.done || after)) ||
    (upper && upper.stagedAt >= staged.cutoff) ||
    (upper && after && compareKeys(after, upper) > 0)
  )
    throw new Error('Invalid staged upload cleanup cursor range')
  return {
    staged: {
      cutoff: staged.cutoff,
      upper,
      done: staged.done,
      ...(after ? { after } : {}),
    } satisfies StagedUploadCleanupSweep,
  }
}

function parseKey(value: unknown): StagedUploadCleanupKey {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['stagedAt', 'id']) ||
    typeof value.stagedAt !== 'string' ||
    !isPreciseTimestampString(value.stagedAt) ||
    typeof value.id !== 'string' ||
    !isUUID(value.id) ||
    value.id !== value.id.toLowerCase()
  )
    throw new Error('Invalid staged upload cleanup key')
  return { stagedAt: value.stagedAt, id: value.id }
}

function compareKeys(left: StagedUploadCleanupKey, right: StagedUploadCleanupKey) {
  if (left.stagedAt < right.stagedAt) return -1
  if (left.stagedAt > right.stagedAt) return 1
  return left.id < right.id ? -1 : Number(left.id > right.id)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
