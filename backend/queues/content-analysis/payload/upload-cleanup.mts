import { hasExactKeys, isPreciseTimestampString } from '@modules/pagination/cursors'
import { isUUID } from '@ts-shared/utils/validation-core'
import type {
  AbandonedUploadSweep,
  CleanupAbandonedUploadsData,
  UploadCleanupKey,
  UploadCleanupWindow,
} from '../types.mts'

const PHASES = ['staged', 'recovery', 'abandonment'] as const

/** Malformed retained progress must fail, rather than silently restarting a global sweep. */
export function parseCleanupAbandonedUploadsData(value: unknown): CleanupAbandonedUploadsData {
  if (!isRecord(value)) throw new Error('Upload cleanup requires an object payload')
  if (Object.keys(value).length === 0) return {}
  if (!hasExactKeys(value, ['sweep']) || !isRecord(value.sweep))
    throw new Error('Invalid upload cleanup payload')
  const sweep = value.sweep
  if (
    !hasExactKeys(sweep, ['recoveryCutoff', 'abandonmentCutoff', 'windows']) ||
    !isTimestamp(sweep.recoveryCutoff) ||
    !isTimestamp(sweep.abandonmentCutoff) ||
    !isRecord(sweep.windows) ||
    !hasExactKeys(sweep.windows, PHASES)
  )
    throw new Error('Invalid upload cleanup snapshot')
  const windows = {
    staged: parseWindow(sweep.windows.staged, sweep.recoveryCutoff),
    recovery: parseWindow(sweep.windows.recovery, sweep.recoveryCutoff),
    abandonment: parseWindow(sweep.windows.abandonment, sweep.abandonmentCutoff),
  }
  return {
    sweep: {
      recoveryCutoff: sweep.recoveryCutoff,
      abandonmentCutoff: sweep.abandonmentCutoff,
      windows,
    } satisfies AbandonedUploadSweep,
  }
}

function parseWindow(value: unknown, cutoff: string): UploadCleanupWindow {
  if (
    !isRecord(value) ||
    typeof value.done !== 'boolean' ||
    !hasExactKeys(
      value,
      Object.hasOwn(value, 'after') ? ['upper', 'after', 'done'] : ['upper', 'done'],
    )
  )
    throw new Error('Invalid upload cleanup window')
  const upper = value.upper === null ? null : parseKey(value.upper)
  const after = value.after === undefined ? undefined : parseKey(value.after)
  if (
    (!upper && (!value.done || after)) ||
    (upper && upper.stagedAt >= cutoff) ||
    (upper && after && compareKeys(after, upper) > 0)
  )
    throw new Error('Invalid upload cleanup cursor range')
  return { upper, done: value.done, ...(after ? { after } : {}) }
}

function parseKey(value: unknown): UploadCleanupKey {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['stagedAt', 'id']) ||
    !isTimestamp(value.stagedAt) ||
    typeof value.id !== 'string' ||
    !isUUID(value.id) ||
    value.id !== value.id.toLowerCase()
  )
    throw new Error('Invalid upload cleanup key')
  return { stagedAt: value.stagedAt, id: value.id }
}

function compareKeys(left: UploadCleanupKey, right: UploadCleanupKey) {
  if (left.stagedAt < right.stagedAt) return -1
  if (left.stagedAt > right.stagedAt) return 1
  return left.id < right.id ? -1 : Number(left.id > right.id)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && isPreciseTimestampString(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
