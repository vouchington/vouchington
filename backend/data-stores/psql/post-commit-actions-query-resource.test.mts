import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
} from './query-capture.mts'
import {
  captureBorrowedClientTransactionQuery,
  captureExplicitTransactionQuery,
  captureInternallyOwnedTransactionQuery,
  captureOwnedTransactionQuery,
} from '../../test-helpers/data-stores/psql/post-commit-actions-query-resource.mts'

describe('explicit query post-commit actions capture wiring', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })

  it('captures queries executed through an owned transaction', async () => {
    enableQueryCapture()
    await captureOwnedTransactionQuery()

    expect(
      getCapturedQueries().filter(query => query.text.includes('/* ownedTransactionCapture */')),
    ).toEqual([
      expect.objectContaining({
        text: '/* ownedTransactionCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures an owned transaction passed as an explicit query exactly once', async () => {
    enableQueryCapture()
    await captureExplicitTransactionQuery()

    expect(
      getCapturedQueries().filter(query => query.text.includes('/* explicitQueryCapture */')),
    ).toEqual([
      expect.objectContaining({
        text: '/* explicitQueryCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures queries executed through an active borrowed client transaction', async () => {
    enableQueryCapture()
    await captureBorrowedClientTransactionQuery()

    expect(
      getCapturedQueries().filter(query => query.text.includes('/* borrowedClientCapture */')),
    ).toEqual([
      expect.objectContaining({
        text: '/* borrowedClientCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })

  it('captures queries executed through an internally owned transaction', async () => {
    enableQueryCapture()

    await captureInternallyOwnedTransactionQuery()

    expect(
      getCapturedQueries().filter(query => query.text.includes('/* internalTransactionCapture */')),
    ).toEqual([
      expect.objectContaining({
        text: '/* internalTransactionCapture */ SELECT $1::integer',
        values: [1],
      }),
    ])
  })
})
