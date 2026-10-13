export type CopyrightSeedIdentity = {
  namespace: string
  postId: string
  imageId: string
  placementId: string
  intakeReviewKey: string
  deadlineKey: string
  submissionId: string
  assessmentId: string
  deadlineId: string
  intakeIpAddress: string
  deadlineIpAddress: string
}

export type CopyrightSeedContext = { identity: CopyrightSeedIdentity; now: Date }

// The ordinary CLI keeps the canonical dataset and every existing replay key.
export const COPYRIGHT_SEED_IDENTITY: Readonly<CopyrightSeedIdentity> = Object.freeze({
  namespace: 'dev-seed-copyright',
  postId: '019c64e6-f720-7c01-a001-000000000001',
  imageId: '019c64e6-f720-7c01-a002-000000000001',
  placementId: '019c64e6-f720-7c01-a003-000000000001',
  intakeReviewKey: '019c64e6-f720-7c03-a001-000000000001',
  deadlineKey: '019c64e6-f720-7c03-a002-000000000001',
  submissionId: '019c64e6-f720-7c02-a001-000000000001',
  assessmentId: '019c64e6-f720-7c02-a002-000000000001',
  deadlineId: '019c64e6-f720-7c02-a003-000000000001',
  intakeIpAddress: '203.0.113.10',
  deadlineIpAddress: '203.0.113.11',
})
