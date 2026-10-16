import { caches } from '@services/entity-cache/caches'
import { getPostByAny } from './get.mts'

export const getPostByAnyCached = caches.posts.cacheGetByAny(getPostByAny)
