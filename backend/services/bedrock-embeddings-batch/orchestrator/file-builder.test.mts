import { readFile, unlink } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { MAX_EMBEDDING_TEXT_LENGTH } from '@services/bedrock-embeddings/config'
import { BatchFileBuilder } from './file-builder.mts'

describe('BatchFileBuilder', () => {
  it('writes Bedrock JSONL text records', async () => {
    const builder = new BatchFileBuilder()
    await builder.addEntity({
      entity_id: 'entity-1',
      content: 'sample content',
      content_sha256: Buffer.from('a'.repeat(64), 'hex'),
    })
    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await builder.close()

    try {
      expect(entityCount).toBe(1)
      const fileContents = await readFile(filePath, 'utf8')
      expect(inputSizeMB).toBe(Buffer.byteLength(fileContents) / 1024 / 1024)
      const [line] = fileContents.trim().split('\n')
      const record = JSON.parse(line)
      expect(JSON.parse(record.recordId)).toEqual({
        entity_id: 'entity-1',
        content_sha256: 'a'.repeat(64),
      })
      expect(record.modelInput.singleEmbeddingParams.text.value).toBe('sample content')
      expect(record.modelInput.singleEmbeddingParams.embeddingDimension).toBe(1024)
      expect(record.modelInput.embeddingConfig).toBeUndefined()
      expect(await readFile(entityIdsFilePath, 'utf8')).toBe('entity-1\n')
    } finally {
      await unlink(filePath).catch(() => {})
      await unlink(entityIdsFilePath).catch(() => {})
    }
  })

  it('writes Bedrock JSONL image records', async () => {
    const builder = new BatchFileBuilder()
    const added = await builder.addImageIfFits(
      {
        entity_id: 'image-1',
        image_sha_256: Buffer.from('b'.repeat(64), 'hex'),
        format: 'jpeg',
        bytes: 'YWJj',
      },
      1,
    )
    const { filePath, entityIdsFilePath, entityCount, inputSizeMB } = await builder.close()

    try {
      expect(added).toBe(true)
      expect(entityCount).toBe(1)
      const fileContents = await readFile(filePath, 'utf8')
      expect(inputSizeMB).toBe(Buffer.byteLength(fileContents) / 1024 / 1024)
      const [line] = fileContents.trim().split('\n')
      const record = JSON.parse(line)
      expect(JSON.parse(record.recordId)).toEqual({
        entity_id: 'image-1',
        image_sha_256: 'b'.repeat(64),
      })
      expect(record.modelInput.singleEmbeddingParams.image).toEqual({
        format: 'jpeg',
        source: { bytes: 'YWJj' },
      })
      expect(record.modelInput.singleEmbeddingParams.embeddingDimension).toBe(1024)
      expect(record.modelInput.embeddingConfig).toBeUndefined()
      expect(await readFile(entityIdsFilePath, 'utf8')).toBe('image-1\n')
    } finally {
      await unlink(filePath).catch(() => {})
      await unlink(entityIdsFilePath).catch(() => {})
    }
  })

  it('does not write an image record that would exceed the input size limit', async () => {
    const builder = new BatchFileBuilder()

    try {
      const added = await builder.addImageIfFits(
        {
          entity_id: 'image-1',
          image_sha_256: Buffer.from('b'.repeat(64), 'hex'),
          format: 'jpeg',
          bytes: 'YWJj',
        },
        0.000001,
      )

      expect(added).toBe(false)
      expect(builder.getEntityCount()).toBe(0)
      expect(builder.getInputSizeMB()).toBe(0)
    } finally {
      await builder.cleanup()
    }
  })

  it('does not write a text record that would exceed the input size limit', async () => {
    const builder = new BatchFileBuilder()

    try {
      const added = await builder.addEntityIfFits(
        {
          entity_id: 'entity-1',
          content: 'sample content',
          content_sha256: Buffer.from('a'.repeat(64), 'hex'),
        },
        0.000001,
      )

      expect(added).toBe(false)
      expect(builder.getEntityCount()).toBe(0)
      expect(builder.getInputSizeMB()).toBe(0)
    } finally {
      await builder.cleanup()
    }
  })

  it('truncates over-limit entity content in the JSONL text.value', async () => {
    const builder = new BatchFileBuilder()
    const longContent = 'word '.repeat(MAX_EMBEDDING_TEXT_LENGTH)
    await builder.addEntity({
      entity_id: 'entity-long',
      content: longContent,
      content_sha256: Buffer.from('c'.repeat(64), 'hex'),
    })
    const { filePath, entityIdsFilePath } = await builder.close()

    try {
      const fileContents = await readFile(filePath, 'utf8')
      const [line] = fileContents.trim().split('\n')
      const record = JSON.parse(line)
      expect(record.modelInput.singleEmbeddingParams.text.value.length).toBeLessThanOrEqual(
        MAX_EMBEDDING_TEXT_LENGTH,
      )
    } finally {
      await unlink(filePath).catch(() => {})
      await unlink(entityIdsFilePath).catch(() => {})
    }
  })
})
