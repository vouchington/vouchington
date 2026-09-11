import { createReadStream, createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { finished, pipeline } from 'node:stream/promises'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { read } from '@data-stores/psql'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import type { BatchResultItem } from './shared.mts'

interface DownloadBatchResultsDeps {
  read?: typeof read
  listOutputObjectKeys?: typeof listOutputObjectKeys
  getOutputObject?: typeof getOutputObject
}

export const downloadBatchResults = async (
  batchId: string,
  deps: DownloadBatchResultsDeps = {},
): Promise<string> => {
  const readBatch = deps.read ?? read
  const listKeys = deps.listOutputObjectKeys ?? listOutputObjectKeys
  const getObject = deps.getOutputObject ?? getOutputObject
  const { rows: batchRows } = await readBatch(
    `/* downloadBatchResults */
    SELECT data
    FROM bedrock_embeddings_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (batchRows.length === 0) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const batchData = batchRows[0].data as { outputS3Uri?: string }
  if (!batchData.outputS3Uri) {
    throw new Error(`Batch ${batchId} has no output S3 URI`)
  }

  const prefix = getS3Prefix(batchData.outputS3Uri)
  const tempFilePath = join(tmpdir(), `bedrock-batch-results-${batchId}-${Date.now()}.jsonl`)
  const writeStream = createWriteStream(tempFilePath)
  let shouldKeepResultsFile = false

  try {
    try {
      const keys = await listKeys(prefix)
      for (const key of keys) {
        // oxlint-disable-next-line no-await-in-loop -- result files must be appended to one stream sequentially.
        const object = await getObject(key)
        if (!object.Body) continue
        // oxlint-disable-next-line no-await-in-loop -- concurrent writes would interleave JSONL output.
        await pipeline(object.Body as NodeJS.ReadableStream, writeStream, { end: false })
      }
    } finally {
      await closeWriteStream(writeStream)
    }
    shouldKeepResultsFile = true
  } finally {
    if (!shouldKeepResultsFile) {
      await cleanupResultsFile(tempFilePath)
    }
  }

  return tempFilePath
}

function closeWriteStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  stream.end()
  return finished(stream)
}

export async function cleanupResultsFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch {
    // Ignore cleanup errors
  }
}

function getS3Prefix(s3Uri: string): string {
  const expected = `s3://${S3BedrockBatchBucket}/`
  if (!s3Uri.startsWith(expected)) {
    throw new Error(`Unsupported Bedrock output URI: ${s3Uri}`)
  }

  return s3Uri.slice(expected.length)
}

/* no-mistakes: integration=bedrock */
async function listOutputObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- S3 pagination depends on the previous continuation token.
    const response = await S3BedrockBatchClient.send(
      new ListObjectsV2Command({
        Bucket: S3BedrockBatchBucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of response.Contents || []) {
      if (item.Key?.endsWith('.out')) keys.push(item.Key)
    }
    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return keys
}

/* no-mistakes: integration=bedrock */
async function getOutputObject(key: string) {
  return await S3BedrockBatchClient.send(
    new GetObjectCommand({
      Bucket: S3BedrockBatchBucket,
      Key: key,
    }),
  )
}

export async function* streamBatchResults(
  filePath: string,
): AsyncGenerator<BatchResultItem, void, unknown> {
  const fileStream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  try {
    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const item = JSON.parse(line) as BatchResultItem
        yield item
      } catch {
        continue
      }
    }
  } finally {
    rl.close()
    fileStream.destroy()
  }
}
