import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installOfflineS3Send } from './s3-offline.mts'

class OfflineTestS3Client extends S3Client {}
installOfflineS3Send(OfflineTestS3Client)

function createClient() {
  const handle = vi.fn<VitestLooseMock>()
  const client = new OfflineTestS3Client({
    region: 'us-west-2',
    credentials: { accessKeyId: 'test-access-key-id', secretAccessKey: 'test-secret-access-key' },
    requestHandler: { handle } as never,
  })
  return { client, handle }
}

const command = () => new DeleteObjectCommand({ Bucket: 'test-images', Key: 'test/object' })

describe('offline S3 default for database-backed projects', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails like fake credentials do, without handing a request to the network handler', async () => {
    const { client, handle } = createClient()

    await expect(client.send(command())).rejects.toMatchObject({
      name: 'InvalidAccessKeyId',
      message: expect.stringContaining('DeleteObjectCommand'),
      $metadata: { httpStatusCode: 403 },
    })
    expect(handle).not.toHaveBeenCalled()
  })

  it('answers a test spy, and returns to the offline default when the spy is restored', async () => {
    const { client } = createClient()
    vi.spyOn(OfflineTestS3Client.prototype, 'send').mockResolvedValue({ stubbed: true } as never)

    await expect(client.send(command())).resolves.toEqual({ stubbed: true })
    vi.restoreAllMocks()
    await expect(client.send(command())).rejects.toMatchObject({ name: 'InvalidAccessKeyId' })
  })
})
