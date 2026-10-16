import { caches } from '@services/entity-cache/caches'
import { getTopicByAny } from './get.mts'

export const getTopicByAnyCached = caches.topics.cacheGetByAny(getTopicByAny)
