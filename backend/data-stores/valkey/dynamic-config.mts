import '@data-stores/valkey-core/app-integration'

export { DynamicConfig } from 'valkyries/dynamic-config'

/**
 * @public Facade re-export for #2998. Production call sites import this from
 * valkyries/dynamic-config, so the production graph does not reference it.
 */
export { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/**
 * @public Facade re-export for #2998. Production call sites import this from
 * valkyries/dynamic-config, so the production graph does not reference it.
 */
export type { BoundedPositiveIntegerLimits } from 'valkyries/dynamic-config'
