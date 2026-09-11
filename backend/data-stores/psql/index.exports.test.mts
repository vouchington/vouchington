import { describe, expect, it } from 'vitest'

import * as dataStoresPsql from './index.mts'
import * as transactions from './transactions.mts'

describe('@data-stores/psql production exports', () => {
  it('exports explicit owned transaction resources', () => {
    expect(dataStoresPsql.beginTransaction).toBeTypeOf('function')
    expect(dataStoresPsql.beginBoundedTransaction).toBeTypeOf('function')
  })

  it('exports bounded resources from the transactions entrypoint', () => {
    expect(transactions.beginTransaction).toBeTypeOf('function')
    expect(transactions.beginBoundedTransaction).toBeTypeOf('function')
  })

  it('does not re-export the unused pipelineBatch adapter', () => {
    // pipelineBatch/PIPELINE_BATCH_MAX are intentionally kept off the barrel surface (knip
    // flagged them as unused Filaments re-exports); the capability itself, and its behavior,
    // remain owned and tested by @vouchington/postgres directly on the psql client, not here.
    expect(dataStoresPsql).not.toHaveProperty('pipelineBatch')
    expect(dataStoresPsql).not.toHaveProperty('PIPELINE_BATCH_MAX')
  })
})
