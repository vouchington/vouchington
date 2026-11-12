import { createGcsTestBucket } from '@voucha/test-helpers/gcs-emulator'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, inject, it, vi } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { uploadGcsFile, uploadGcsImage, listGcsOutputs, downloadGcsObject } from './gcs.mts'

describe('GCS batch storage', () => {
  it('streams batch input and image objects through the real GCS emulator API', async () => {
    const { endpoint } = inject('gcsEmulator')
    const bucket = `gemini-${randomUUID()}`
    await createGcsTestBucket(endpoint, bucket)
    const fixture = createVertexHttpFixture()
    fixture.agent.enableNetConnect(new URL(endpoint).host)
    vi.stubEnv('VERTEX_BATCH_BUCKET', bucket)
    const directory = await mkdtemp(join(tmpdir(), 'gemini-gcs-'))
    const path = join(directory, 'input.jsonl')
    const input = '{"key":"post:synthetic-post","request":{}}\n'
    await writeFile(path, input)
    try {
      await withMockAgentDefaultFetchForTest(
        fixture.agent,
        async () => {
          await uploadGcsFile(path, 'job/output/predictions.jsonl', endpoint)
          await uploadGcsImage(
            Buffer.from('synthetic image bytes'),
            'job/images/image.jpeg',
            'image/jpeg',
            endpoint,
          )
          const listing = await listGcsOutputs('job/output/', undefined, endpoint)
          expect(listing).toMatchObject({
            objects: [
              {
                name: 'job/output/predictions.jsonl',
                generation: expect.any(String),
                size: String(Buffer.byteLength(input)),
              },
            ],
            nextPageToken: undefined,
          })
          const object = listing.objects[0] as { generation: string }
          const output = await downloadGcsObject(
            'job/output/predictions.jsonl',
            endpoint,
            object.generation,
          )
          expect(await output.text()).toBe(input)
          const image = await downloadGcsObject('job/images/image.jpeg', endpoint)
          expect(await image.text()).toBe('synthetic image bytes')
          await expect(
            uploadGcsFile(path, 'job/output/predictions.jsonl', endpoint),
          ).rejects.toMatchObject({ status: 412 })
        },
        [endpoint],
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
