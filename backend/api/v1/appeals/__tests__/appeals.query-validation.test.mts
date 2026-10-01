import { describe } from 'vitest'
import { registerCaseListQueryContractTests } from '../../../../test-helpers/case-list-query-contract-tests.mts'

describe('GET /api/v1/appeals query contract', () => {
  registerCaseListQueryContractTests({ path: '/api/v1/appeals', listKey: 'appeals' })
})
