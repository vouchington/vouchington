import type { UpdateRssFeedChanges } from './update-types.mts'

export type RssFeedStateChange = {
  kind: 'enablement' | 'discoverability'
  is_enabled: boolean
}

export function omitStateChanges({
  is_enabled: _enabled,
  discoverable: _discoverable,
  ...fieldChanges
}: UpdateRssFeedChanges): UpdateRssFeedChanges {
  return fieldChanges
}
