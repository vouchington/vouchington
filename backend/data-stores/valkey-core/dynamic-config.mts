import './app-integration.mts'

import type { RegisteredDynamicConfigKey } from '@voucha/config/dynamic-config-registry-order'
// oxlint-disable-next-line no-restricted-imports -- The typed facade must reference the raw class value.
import { DynamicConfig as RawDynamicConfig } from 'valkyries/dynamic-config'

type DynamicConfigOptions = ConstructorParameters<typeof RawDynamicConfig>[0]

export const DynamicConfig: new (
  options: Omit<DynamicConfigOptions, 'key'> & { key: RegisteredDynamicConfigKey },
) => RawDynamicConfig = RawDynamicConfig
