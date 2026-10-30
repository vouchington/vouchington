export const COPYRIGHT_RETENTION_FIELD_TYPES = {
  caseRetentionMonths: 'number',
  complaintWindowMonths: 'number',
  replayRetentionMonths: 'number',
  replayReviewMonths: 'number',
  submissionKeyRetentionDays: 'number',
  retentionCaseBatchSize: 'number',
  retentionProofPageSize: 'number',
  retentionProofMaxPages: 'number',
  encryptionOwnerBatchSize: 'number',
  encryptionFetchConcurrency: 'number',
  encryptionOrphanGraceHours: 'number',
} as const

export const COPYRIGHT_RETENTION_DEFAULT_FIELDS = {
  caseRetentionMonths: 72,
  complaintWindowMonths: 6,
  replayRetentionMonths: 120,
  replayReviewMonths: 12,
  submissionKeyRetentionDays: 30,
  retentionCaseBatchSize: 25,
  retentionProofPageSize: 50,
  retentionProofMaxPages: 32,
  encryptionOwnerBatchSize: 1000,
  encryptionFetchConcurrency: 4,
  encryptionOrphanGraceHours: 24,
}

export const COPYRIGHT_RETENTION_WINDOW_MAX_VALUES = {
  caseRetentionMonths: 1200,
  complaintWindowMonths: 120,
  replayRetentionMonths: 1200,
  replayReviewMonths: 120,
  submissionKeyRetentionDays: 3650,
  retentionCaseBatchSize: 100,
  retentionProofPageSize: 50,
  retentionProofMaxPages: 64,
  encryptionOwnerBatchSize: 5000,
  encryptionFetchConcurrency: 16,
  encryptionOrphanGraceHours: 8760,
}
