import { S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = ['NODE_ENV', 'S3_BUCKET_IMAGES', 'VITEST'] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>

describe('getImageFromS3', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    restoreEnv()
  })

  it('reads images from the selected bucket', async () => {
    vi.resetModules()
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
    process.env.NODE_ENV = 'development'
    process.env.VITEST = 'true'
    const sendSpy = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ Body: undefined } as never)
    const { getImageFromS3 } = await import('../s3.mts')

    await getImageFromS3('development', 'image-key')

    const command = sendSpy.mock.calls[0]?.[0] as { input?: unknown }
    expect(command.input).toMatchObject({
      Bucket: 'test-images',
      Key: 'image-key',
    })
  })
})

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
