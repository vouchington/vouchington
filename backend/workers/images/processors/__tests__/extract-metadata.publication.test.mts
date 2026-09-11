import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { setImageHashAndProcessing } from '@voucha/test-helpers/entities/images'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import {
  processExtractImageMetadata,
  type ProcessExtractImageMetadataDeps,
} from '../extract-metadata.mts'
import * as presignModule from '@services/images/presign-upload-url'
import type { PrivateUser } from '@services/users/types'

let user: PrivateUser

function createAsyncVoidMock() {
  return vi.fn<() => Promise<void>>(async () => undefined)
}

function createPublishImageStateMock() {
  return vi.fn<(imageId: string, state: Record<string, unknown>) => Promise<void>>(
    async () => undefined,
  )
}

function createGetImageFromS3Mock() {
  return vi.fn<ProcessExtractImageMetadataDeps['getImageFromS3']>(async () => ({
    $metadata: {},
    Body: Readable.from([Buffer.from('fake-bytes')]) as never,
  }))
}

function createSharpMock(metadata: Record<string, unknown>) {
  return vi.fn<(filename: string) => { metadata: () => Promise<Record<string, unknown>> }>(() => ({
    metadata: vi.fn<() => Promise<Record<string, unknown>>>(async () => metadata),
  }))
}

describe('extract-metadata state publication', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(presignModule, 'presignImageUploadUrl').mockResolvedValue(
      'https://images.example.test/fake-signature',
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function createProcessingImage(): Promise<string> {
    const { image_id } = await createImageUploadUrl(user, {
      contentType: 'image/jpeg',
      contentLength: 1024,
    })
    await setImageHashAndProcessing(image_id, randomBytes(32))
    return image_id
  }

  function makeDeps(overrides?: Partial<ProcessExtractImageMetadataDeps>) {
    return {
      getImageFromS3: overrides?.getImageFromS3 ?? createGetImageFromS3Mock(),
      getDeployEnvironment:
        overrides?.getDeployEnvironment ??
        vi.fn<ProcessExtractImageMetadataDeps['getDeployEnvironment']>(() => 'test'),
      publishImageState: overrides?.publishImageState ?? createPublishImageStateMock(),
      enqueueOnImageCreated: overrides?.enqueueOnImageCreated ?? createAsyncVoidMock(),
      createSharp:
        overrides?.createSharp ?? createSharpMock({ format: 'jpeg', width: 1920, height: 1080 }),
      onError: overrides?.onError ?? vi.fn<(error: Error) => void>(),
    }
  }

  it('publishes complete intermediate state on successful finalize', async () => {
    const image_id = await createProcessingImage()
    const publishImageState = createPublishImageStateMock()

    await processExtractImageMetadata(image_id, {
      ...makeDeps({ publishImageState }),
    })

    expect(publishImageState).toHaveBeenCalledWith(image_id, {
      id: image_id,
      upload_status: 'complete',
      upload_error: null,
      ready: false,
      blocked: false,
    })
  })

  it('publishes complete intermediate state through the default pubsub adapter', async () => {
    const image_id = await createProcessingImage()
    const originalPublish = imageStatePubSub.publish
    const publishSpy = vi.fn<(imageId: string, state: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    )
    imageStatePubSub.publish = publishSpy
    const { publishImageState: _ignored, ...deps } = makeDeps()

    try {
      await processExtractImageMetadata(image_id, deps)

      expect(publishSpy).toHaveBeenCalledWith(image_id, {
        id: image_id,
        upload_status: 'complete',
        upload_error: null,
        ready: false,
        blocked: false,
      })
    } finally {
      imageStatePubSub.publish = originalPublish
    }
  })

  it('publishes failed terminal state when image processing fails', async () => {
    const image_id = await createProcessingImage()
    const publishImageState = vi.fn<
      (imageId: string, state: { upload_status: string }) => Promise<void>
    >(async (_imageId, state) => {
      if (state.upload_status === 'failed') {
        throw new Error('transient publish failure')
      }
    })

    await expect(
      processExtractImageMetadata(image_id, {
        ...makeDeps({ publishImageState: publishImageState as never }),
        getImageFromS3: vi.fn<ProcessExtractImageMetadataDeps['getImageFromS3']>(async () => ({
          $metadata: {},
          Body: undefined,
        })),
      }),
    ).rejects.toThrow(/S3 response body is empty/)
  })
})
