import { afterAll, describe, expect, it } from 'vitest'
import { probeSharedMutationTrigger } from '../../../test-helpers/data-stores/psql/shared-mutation-trigger.mts'
import { onGracefulShutdown } from '../index.mts'

describe('shared append-only mutation guard', () => {
  afterAll(onGracefulShutdown)

  it('allows FK actor erasure while preserving ledger facts', async () => {
    await expect(probeSharedMutationTrigger('eraseActor')).resolves.toEqual({
      count: 1,
      actorErased: true,
      fact: 'original',
    })
  })

  it.each(['replaceActor', 'rewriteFact', 'eraseAndRewrite', 'deleteDirectly'] as const)(
    'rejects %s even when a foreign-key action could otherwise erase an actor',
    async probe => {
      await expect(probeSharedMutationTrigger(probe)).rejects.toMatchObject({ code: '23514' })
    },
  )

  it('allows the owning parent to cascade its history', async () => {
    await expect(probeSharedMutationTrigger('deleteParent')).resolves.toMatchObject({ count: 0 })
  })

  it('allows an update that changes no ledger fact', async () => {
    await expect(probeSharedMutationTrigger('unchanged')).resolves.toEqual({
      count: 1,
      actorErased: false,
      fact: 'original',
    })
  })

  it('enforces a guard with no actor-erasure arguments', async () => {
    await expect(probeSharedMutationTrigger('unchanged', false)).resolves.toMatchObject({
      count: 1,
    })
    await expect(probeSharedMutationTrigger('rewriteFact', false)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(probeSharedMutationTrigger('eraseActor', false)).rejects.toMatchObject({
      code: '23514',
    })
  })
})
