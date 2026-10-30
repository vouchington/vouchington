import '@data-stores/valkey-core/app-integration'
import { detachedBackgroundWork } from '@modules/utils/detached-background-work'
import { ValkeyCache as BaseValkeyCache, multiCacheGetByAnyBatch } from 'valkyries/cache'
import type { ValkeyCacheOptions } from 'valkyries'

export { multiCacheGetByAnyBatch }

export class ValkeyCache<K = string> extends BaseValkeyCache<K> {
  constructor(options: ValkeyCacheOptions<K>) {
    super({ runBackgroundRefresh: detachedBackgroundWork.run, ...options })
  }
}
