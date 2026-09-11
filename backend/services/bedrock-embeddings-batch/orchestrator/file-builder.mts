import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EMBEDDING_DIMENSION, truncateEmbeddingText } from '@services/bedrock-embeddings/config'
import { csvEscape } from './csv.mts'
type BatchFileEntity = {
  entity_id: string
  content: string
  content_sha256: Buffer
}
type BatchFileImage = {
  entity_id: string
  image_sha_256: Buffer
  format: 'jpeg' | 'png' | 'webp'
  bytes: string
}
export class BatchFileBuilder {
  private filePath: string
  private entityIdsFilePath: string
  private writeStream: ReturnType<typeof createWriteStream> | null = null
  private entityIdsWriteStream: ReturnType<typeof createWriteStream> | null = null
  private entityCount = 0
  private firstWrite = true
  private inputBytes = 0
  constructor() {
    const fileNamePrefix = `bedrock-embeddings-batch-${Date.now()}-${randomUUID()}`
    this.filePath = join(tmpdir(), `${fileNamePrefix}.jsonl`)
    this.entityIdsFilePath = join(tmpdir(), `${fileNamePrefix}-entity-ids.csv`)
  }
  async addEntity(entity: BatchFileEntity): Promise<void> {
    const { line, prefix } = this.createEntityLine(entity)
    await this.writeEntity(entity, line, prefix)
  }
  async addEntityIfFits(entity: BatchFileEntity, maxInputSizeMB: number): Promise<boolean> {
    const { line, prefix } = this.createEntityLine(entity)
    const projectedInputBytes = this.inputBytes + Buffer.byteLength(prefix + line)
    if (projectedInputBytes / 1024 / 1024 > maxInputSizeMB) return false
    await this.writeEntity(entity, line, prefix)
    return true
  }
  private async writeEntity(entity: BatchFileEntity, line: string, prefix: string): Promise<void> {
    if (!this.writeStream) {
      this.writeStream = createWriteStream(this.filePath, { flags: 'a' })
    }
    if (!this.entityIdsWriteStream) {
      this.entityIdsWriteStream = createWriteStream(this.entityIdsFilePath, { flags: 'a' })
    }
    if (prefix) {
      await writeChunk(this.writeStream, prefix)
    }
    this.firstWrite = false
    await writeChunk(this.writeStream, line)
    this.inputBytes += Buffer.byteLength(prefix + line)
    await writeChunk(this.entityIdsWriteStream, `${csvEscape(entity.entity_id)}\n`)
    this.entityCount++
  }
  private createEntityLine(entity: BatchFileEntity): { line: string; prefix: string } {
    const customId = JSON.stringify({
      entity_id: entity.entity_id,
      content_sha256: entity.content_sha256.toString('hex'),
    })
    const line = JSON.stringify({
      recordId: customId,
      modelInput: {
        taskType: 'SINGLE_EMBEDDING',
        singleEmbeddingParams: {
          embeddingPurpose: 'GENERIC_INDEX',
          embeddingDimension: EMBEDDING_DIMENSION,
          text: {
            truncationMode: 'END',
            value: truncateEmbeddingText(entity.content),
          },
        },
      },
    })
    const prefix = this.firstWrite ? '' : '\n'
    return { line, prefix }
  }
  async addImageIfFits(image: BatchFileImage, maxInputSizeMB: number): Promise<boolean> {
    const { line, prefix } = this.createImageLine(image)
    const projectedInputBytes = this.inputBytes + Buffer.byteLength(prefix + line)
    if (projectedInputBytes / 1024 / 1024 > maxInputSizeMB) return false
    await this.writeImage(image, line, prefix)
    return true
  }
  private async writeImage(image: BatchFileImage, line?: string, prefix?: string): Promise<void> {
    if (!this.writeStream) {
      this.writeStream = createWriteStream(this.filePath, { flags: 'a' })
    }
    if (!this.entityIdsWriteStream) {
      this.entityIdsWriteStream = createWriteStream(this.entityIdsFilePath, { flags: 'a' })
    }
    const prepared =
      line === undefined || prefix === undefined ? this.createImageLine(image) : { line, prefix }
    if (prepared.prefix) {
      await writeChunk(this.writeStream, prepared.prefix)
    }
    this.firstWrite = false
    await writeChunk(this.writeStream, prepared.line)
    this.inputBytes += Buffer.byteLength(prepared.prefix + prepared.line)
    await writeChunk(this.entityIdsWriteStream, `${csvEscape(image.entity_id)}\n`)
    this.entityCount++
  }
  private createImageLine(image: BatchFileImage): { line: string; prefix: string } {
    const recordId = JSON.stringify({
      entity_id: image.entity_id,
      image_sha_256: image.image_sha_256.toString('hex'),
    })
    const line = JSON.stringify({
      recordId,
      modelInput: {
        taskType: 'SINGLE_EMBEDDING',
        singleEmbeddingParams: {
          embeddingPurpose: 'GENERIC_INDEX',
          embeddingDimension: EMBEDDING_DIMENSION,
          image: {
            format: image.format,
            source: {
              bytes: image.bytes,
            },
          },
        },
      },
    })
    const prefix = this.firstWrite ? '' : '\n'
    return { line, prefix }
  }
  async close(): Promise<{
    filePath: string
    entityIdsFilePath: string
    entityCount: number
    inputSizeMB: number
  }> {
    await closeWriteStream(this.writeStream)
    await closeWriteStream(this.entityIdsWriteStream)
    this.writeStream = null
    this.entityIdsWriteStream = null
    return {
      filePath: this.filePath,
      entityIdsFilePath: this.entityIdsFilePath,
      entityCount: this.entityCount,
      inputSizeMB: this.getInputSizeMB(),
    }
  }
  async cleanup(): Promise<void> {
    await closeWriteStream(this.writeStream)
    await closeWriteStream(this.entityIdsWriteStream)
    this.writeStream = null
    this.entityIdsWriteStream = null
    try {
      await unlink(this.filePath)
    } catch {
      // Ignore errors
    }
    try {
      await unlink(this.entityIdsFilePath)
    } catch {
      // Ignore errors
    }
  }
  getFilePath(): string {
    return this.filePath
  }
  getEntityIdsFilePath(): string {
    return this.entityIdsFilePath
  }

  getEntityCount(): number {
    return this.entityCount
  }

  getInputSizeMB(): number {
    return this.inputBytes / 1024 / 1024
  }
}

function writeChunk(
  stream: ReturnType<typeof createWriteStream> | null,
  chunk: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream!.write(chunk, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function closeWriteStream(stream: ReturnType<typeof createWriteStream> | null): Promise<void> {
  if (!stream) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    stream.end((err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
