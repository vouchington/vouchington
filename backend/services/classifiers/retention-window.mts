import { getMinUUIDv7ForDate } from '@modules/utils/ids'

export const CLASSIFIER_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export function classifierRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - CLASSIFIER_RETENTION_DAYS * DAY_MS)
}

export function assertClassifierBatchWithinRetention(batchId: string, now = new Date()): void {
  if (batchId.toLowerCase() < getMinUUIDv7ForDate(classifierRetentionCutoff(now))) {
    throw new RangeError('Classifier decision batch is outside the retention window')
  }
}

export function assertClassifierWindowWithinRetention(from: Date, now = new Date()): void {
  if (from.getTime() < classifierRetentionCutoff(now).getTime()) {
    throw new RangeError('Classifier report window starts before the retention cutoff')
  }
}
