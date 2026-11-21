import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { estimateTokens } from '@modules/utils'
import { BatchFileBuilder } from './file-builder.mts'

const entity = {
  entity_id: 'synthetic-id',
  title: 'Synthetic document title',
  content: 'synthetic document',
  content_sha256: Buffer.alloc(32),
}

describe('Vertex JSONL builder', () => {
  it('streams title-aware bounded document records and lock identifiers with exact byte accounting', async () => {
    const builder = new BatchFileBuilder('posts')
    try {
      await builder.addEntity(entity)
      const longUnicodeBody = '漢字🙂 synthetic body '.repeat(1_600)
      await builder.addEntity({
        ...entity,
        entity_id: 'second',
        title: 'Long Unicode title🙂 '.repeat(30),
        content: longUnicodeBody,
      })
      const result = await builder.close()
      const body = await readFile(result.filePath, 'utf8')
      expect(result.entityCount).toBe(2)
      expect(result.inputSizeMB).toBe(Buffer.byteLength(body) / 1024 / 1024)
      const rows = body.split('\n').map(line => JSON.parse(line))
      expect(rows[0]).toMatchObject({
        key: 'post:synthetic-id',
        request: {
          content: {
            parts: [{ text: 'title: Synthetic document title | text: synthetic document' }],
          },
          embed_content_config: { output_dimensionality: 1536 },
        },
      })
      const boundedPrompt = rows[1].request.content.parts[0].text as string
      expect(boundedPrompt).toContain('title: Long Unicode title🙂 ')
      expect(
        boundedPrompt.startsWith(`title: ${'Long Unicode title🙂 '.repeat(30)} | text: `),
      ).toBe(true)
      expect(boundedPrompt).not.toContain('title: none')
      expect(estimateTokens(boundedPrompt)).toBeLessThanOrEqual(7_680)
      expect(boundedPrompt.isWellFormed()).toBe(true)
      expect(await readFile(result.entityIdsFilePath, 'utf8')).toBe(
        `synthetic-id,${'0'.repeat(64)}\nsecond,${'0'.repeat(64)}\n`,
      )
    } finally {
      await builder.cleanup()
    }
  })

  it('rejects rows before writes or uploads when the configured byte budget is exhausted', async () => {
    const builder = new BatchFileBuilder('images')
    const fixture = createVertexHttpFixture()
    void fixture
    try {
      expect(await builder.addEntityIfFits(entity, 0.000001)).toBe(false)
      expect(
        await builder.addImageIfFits(
          { entity_id: 'image-id', image_sha_256: Buffer.alloc(32), format: 'jpeg', bytes: 'YWJj' },
          0.000001,
        ),
      ).toBe(false)
      expect(builder.getEntityCount()).toBe(0)
      expect(builder.getInputSizeMB()).toBe(0)
    } finally {
      await builder.cleanup()
    }
  })

  it('uploads bounded image bytes under a unique job prefix and writes GCS fileData with the source hash', async () => {
    const fixture = createVertexHttpFixture()
    const builder = new BatchFileBuilder('images')
    const key = `${builder.storagePrefix}images/image-id/${'ab'.repeat(32)}.jpeg`
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({
        method: 'POST',
        path: `/upload/storage/v1/b/synthetic-embeddings/o?ifGenerationMatch=0&name=${encodeURIComponent(key)}&uploadType=media`,
        body: bytes => Buffer.isBuffer(bytes) && bytes.equals(Buffer.from('abc')),
      })
      .reply(200, {})
    try {
      await fixture.run(async () => {
        expect(
          await builder.addImageIfFits(
            {
              entity_id: 'image-id',
              image_sha_256: Buffer.from('ab'.repeat(32), 'hex'),
              format: 'jpeg',
              bytes: 'YWJj',
            },
            1,
          ),
        ).toBe(true)
      })
      const result = await builder.close()
      expect(JSON.parse(await readFile(result.filePath, 'utf8'))).toEqual({
        key: 'image:image-id',
        request: {
          content: {
            parts: [
              { fileData: { fileUri: `gs://synthetic-embeddings/${key}`, mimeType: 'image/jpeg' } },
            ],
          },
          embed_content_config: { output_dimensionality: 1536 },
        },
      })
    } finally {
      await builder.cleanup()
    }
  })
})
