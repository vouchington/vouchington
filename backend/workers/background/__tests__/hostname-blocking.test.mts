import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import {
  enqueueHostnameBlockRecovery,
  enqueueOrReactivateHostnameBlockCleanups,
} from '@queues/background/enqueues/hostname-blocking'
import { background } from '@queues/background/queues'

describe('hostname blocking enqueues', () => {
  it('uses the block operation and progress as the stable cleanup identity', async () => {
    const data = { blockId: randomUUID(), progress: 7, cursor: { stage: 'penalties' } as const }
    const expectedId = `hostnameBlock__${data.blockId}__7`

    await enqueueOrReactivateHostnameBlockCleanups([data])

    await expect(readEnqueuedJob(background, { id: expectedId })).resolves.toMatchObject({
      id: expectedId,
      name: 'hostname-blocking.processBlock',
      data,
      opts: { ordering: { key: 'hostname-blocking', concurrency: 2 } },
    })
  })

  it('gives each bounded recovery continuation a stable cursor identity', async () => {
    const data = { afterBlockId: randomUUID() }
    const expectedId = `hostnameBlockingRecovery__${data.afterBlockId}`

    await enqueueHostnameBlockRecovery(data)

    await expect(readEnqueuedJob(background, { id: expectedId })).resolves.toMatchObject({
      id: expectedId,
      name: 'hostname-blocking.recoverBlocks',
      data,
      opts: { ordering: { key: 'hostname-blocking:dispatcher', concurrency: 1 } },
    })
  })
})
