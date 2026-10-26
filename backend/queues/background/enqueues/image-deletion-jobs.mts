import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

export const IMAGE_DELETION_DOMAIN = defineBackgroundDomain({
  domain: 'image-deletion',
  workerConcurrency: 2,
})
export type ImageDeletionPageData = {
  imageId: string
  cursor: string | null
  admittedThrough?: string
}
export const IMAGE_DELETION_PAGE_JOB = defineBackgroundJob<ImageDeletionPageData>(
  IMAGE_DELETION_DOMAIN,
  {
    name: 'page',
    priority: PRIORITY_DISPATCH,
  },
)
export type ImageDeletionRecoveryData = {
  imageIds?: readonly string[]
  afterId?: string
  throughId?: string
}
export const IMAGE_DELETION_RECOVER_JOB = defineBackgroundJob<ImageDeletionRecoveryData>(
  IMAGE_DELETION_DOMAIN,
  {
    ...pagedDispatchJobOptions('images'),
    name: 'recover',
    priority: PRIORITY_DISPATCH,
    ordering: { key: 'image-deletion:recovery' },
  },
)
export const IMAGE_DELETION_JOBS = [IMAGE_DELETION_PAGE_JOB, IMAGE_DELETION_RECOVER_JOB] as const
