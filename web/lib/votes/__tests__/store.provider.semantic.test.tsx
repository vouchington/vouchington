import { render } from '@testing-library/react'
import { useContext } from 'react'
import { describe, expect, it } from 'vitest'
import { VoteStoreContext, type VoteStore } from '../store'
import { VoteStoreProvider } from '../vote-store-provider'

function captureStore(onStore: (store: VoteStore) => void) {
  function Probe() {
    const store = useContext(VoteStoreContext)
    if (!store) throw new Error('Missing vote store')
    onStore(store)
    return null
  }
  render(
    <VoteStoreProvider>
      <Probe />
    </VoteStoreProvider>,
  )
}

describe('semantic vote store provider', () => {
  it('keeps the first hydration and namespaces entity types', () => {
    let store: VoteStore | undefined
    captureStore(value => {
      store = value
    })
    const voteStore = store!
    voteStore.hydrate('post', 'same', { currentVote: 'like', countUp: 3, countDown: 1 })
    voteStore.hydrate('post', 'same', { currentVote: 'disavow', countUp: 0, countDown: 9 })
    voteStore.hydrate('topic', 'same', { currentVote: 'support', countUp: 2, countDown: 0 })
    expect(voteStore.getEntry('post', 'same')).toMatchObject({ currentVote: 'like', countUp: 3 })
    expect(voteStore.getEntry('topic', 'same')).toMatchObject({
      currentVote: 'support',
      countUp: 2,
    })
  })

  it('isolates keys and only rolls back its still-current optimistic entry', () => {
    let store: VoteStore | undefined
    captureStore(value => {
      store = value
    })
    const voteStore = store!
    voteStore.hydrate('post', 'one', { currentVote: null, countUp: 0, countDown: 0 })
    voteStore.hydrate('post', 'two', { currentVote: null, countUp: 0, countDown: 0 })
    const rollbackFirst = voteStore.applyOptimistic('post', 'one', 'vouch')
    voteStore.applyOptimistic('post', 'one', 'disavow')
    rollbackFirst()
    expect(voteStore.getEntry('post', 'one')?.currentVote).toBe('disavow')
    expect(voteStore.getEntry('post', 'two')?.currentVote).toBeNull()
    expect(voteStore.applyOptimistic('post', 'missing', 'vouch')).not.toThrow()
  })

  it('keeps provider instances isolated', () => {
    const stores: VoteStore[] = []
    captureStore(store => stores.push(store))
    captureStore(store => stores.push(store))
    stores[0]!.hydrate('post', 'shared', { currentVote: 'vouch', countUp: 1, countDown: 0 })
    expect(stores[1]!.getEntry('post', 'shared')).toBeUndefined()
  })
})
