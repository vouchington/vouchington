import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { UnrecoverableError } from '@modules/queue-errors'
import { SES_INBOUND_RECONCILE_JOB_NAME } from '@ts-shared/ses-inbound-contract'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'
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

type ProcessDependencies = Required<NonNullable<Parameters<typeof processSesInboundEmail>[1]>>

function createDependencySpies() {
  return {
    copySesInboundObjectToCopyrightEvidence:
      vi.fn<ProcessDependencies['copySesInboundObjectToCopyrightEvidence']>(),
    createCopyrightEmailIntake: vi.fn<ProcessDependencies['createCopyrightEmailIntake']>(),
    deleteSesInboundObject: vi.fn<ProcessDependencies['deleteSesInboundObject']>(),
    enqueueCopyrightEmailIntakeAndWait:
      vi.fn<ProcessDependencies['enqueueCopyrightEmailIntakeAndWait']>(),
    loadSesInboundObject: vi.fn<ProcessDependencies['loadSesInboundObject']>(),
    loadSesInboundObjectAndHash: vi.fn<ProcessDependencies['loadSesInboundObjectAndHash']>(),
    loadSesInboundObjectVersion: vi.fn<ProcessDependencies['loadSesInboundObjectVersion']>(),
    moveSesInboundObjectToFailed: vi.fn<ProcessDependencies['moveSesInboundObjectToFailed']>(),
    parseSesInboundMime: vi.fn<ProcessDependencies['parseSesInboundMime']>(),
    recordCopyrightEmailParse: vi.fn<ProcessDependencies['recordCopyrightEmailParse']>(),
  } satisfies ProcessDependencies
}

describe('processSesInboundEmail intake kind boundary', () => {
  it('fails a support job terminally before any copy, write, parse, enqueue or source change', async () => {
    const dependencies = createDependencySpies()

    await expect(
      processSesInboundEmail(
        {
          sesMessageId: 'ses-support-message',
          objectKey: 'incoming/ses-support-message',
          intakeKind: 'support',
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    // Neither delete nor move may run: the source object stays at its original key.
    expect(dependencies.deleteSesInboundObject).not.toHaveBeenCalled()
    expect(dependencies.moveSesInboundObjectToFailed).not.toHaveBeenCalled()
    for (const dependency of Object.values(dependencies)) {
      expect(dependency).not.toHaveBeenCalled()
    }
  })

  it('still sends a copyright job through the same dependencies', async () => {
    const dependencies = createDependencySpies()
    dependencies.loadSesInboundObjectAndHash.mockRejectedValue(new Error('S3 is unavailable'))

    await expect(
      processSesInboundEmail(
        {
          sesMessageId: 'ses-copyright-message',
          objectKey: 'copyright-incoming/ses-copyright-message',
          intakeKind: 'copyright',
        },
        dependencies,
      ),
    ).rejects.toThrow('S3 is unavailable')

    expect(dependencies.loadSesInboundObjectAndHash).toHaveBeenCalledExactlyOnceWith(
      'copyright-incoming/ses-copyright-message',
    )
    expect(dependencies.moveSesInboundObjectToFailed).not.toHaveBeenCalled()
    expect(dependencies.deleteSesInboundObject).not.toHaveBeenCalled()
  })
})
