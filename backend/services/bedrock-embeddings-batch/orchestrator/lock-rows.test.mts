import { randomUUID } from 'node:crypto'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'
import { describe, expect, it } from 'vitest'
import { insertBatchAndLockRows } from './persist-batch.mts'

describe('topic embedding batch admission (real PG)', () => {
  it('rejects the whole provider input when one candidate is already merged', async () => {
    const actor = await createTestUserDirect()
    const suffix = randomUUID()
    const sourceId = await insertTestTopic({
      name: `Embedding source ${suffix}`,
      slug: `embedding-source-${suffix}`,
      createdById: actor.id,
    })
    const destinationId = await insertTestTopic({
      name: `Embedding destination ${suffix}`,
      slug: `embedding-destination-${suffix}`,
      createdById: actor.id,
    })
    await mergeTopicForTest(sourceId, destinationId, actor.id)
    const filePath = join(tmpdir(), `topic-batch-${suffix}.csv`)
    await writeFile(filePath, `${sourceId}\n${destinationId}\n`)
    try {
      await expect(
        insertBatchAndLockRows({
          batchId: mintUUIDv7(),
          jobType: 'topics',
          entityCount: 2,
          entityIdsFilePath: filePath,
          data: {},
          urlId: null,
          crawlId: null,
        }),
      ).rejects.toThrow('inactive topic')
    } finally {
      await rm(filePath, { force: true })
    }
  })
})
