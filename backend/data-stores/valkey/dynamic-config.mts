// One registered-key facade is shared by general Valkey consumers and queue infrastructure.
export { DynamicConfig } from '@data-stores/valkey-core/dynamic-config'

/** @public Existing facade utility; production callers use valkyries/dynamic-config directly. */
export { getBoundedPositiveIntegerField } from '@data-stores/valkey-core/dynamic-config'

/** @public Existing facade type; production callers use valkyries/dynamic-config directly. */
export type { BoundedPositiveIntegerLimits } from '@data-stores/valkey-core/dynamic-config'
