import { describe } from 'vitest'
import { registerCaseListQueryContractTests } from '../../../../test-helpers/case-list-query-contract-tests.mts'

describe('GET /api/v1/disputes query contract', () => {
  registerCaseListQueryContractTests({ path: '/api/v1/disputes', listKey: 'disputes' })
})
