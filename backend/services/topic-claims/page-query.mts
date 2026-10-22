import { createPaginationParser } from '@modules/pagination'
import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryString,
} from '@vouchington/pagination'

export const topicClaimPageParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

export const myTopicClaimFilters = defineQueryContract({
  topic_ids: queryCsvArray(queryString()),
  verified_only: queryBoolean(),
})

export const topicClaimFilters = defineQueryContract({
  active_only: queryBoolean(),
  mine_only: queryBoolean(),
})
