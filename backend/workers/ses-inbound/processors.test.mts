import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { SES_INBOUND_RECONCILE_JOB_NAME } from '@ts-shared/ses-inbound-contract'
import { reconcileSesInboundEmails } from './processors.mts'
import { listCopyrightSesInboundObjects } from './processors/s3.mts'

describe('reconcileSesInboundEmails without an SES inbound bucket', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([undefined, '', '   '])(
    'still fails an S3 operation that needs the bucket when S3_BUCKET_SES_INBOUND is %j',
    async bucket => {
      vi.stubEnv('S3_BUCKET_SES_INBOUND', bucket)

      await expect(listCopyrightSesInboundObjects()).rejects.toThrow(
        'S3_BUCKET_SES_INBOUND is required',
      )
    },
  )

  it.each([undefined, '', '   '])(
    'skips loudly instead of throwing when S3_BUCKET_SES_INBOUND is %j',
    async bucket => {
      vi.stubEnv('S3_BUCKET_SES_INBOUND', bucket)
      const listCopyrightSesInboundObjects = vi.fn<() => Promise<never>>()

      await expect(reconcileSesInboundEmails({ listCopyrightSesInboundObjects })).resolves.toEqual({
        enqueued: 0,
      })

      expect(listCopyrightSesInboundObjects).not.toHaveBeenCalled()
      expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
        'scheduled_job_config_missing',
        {
          level: 'warning',
          tags: {
            reason: 'scheduled_job_config_missing',
            jobName: SES_INBOUND_RECONCILE_JOB_NAME,
            missingEnvVar: 'S3_BUCKET_SES_INBOUND',
          },
        },
      )
    },
  )
})
