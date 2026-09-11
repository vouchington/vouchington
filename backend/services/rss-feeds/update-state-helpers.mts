import type { UpdateRssFeedChanges } from './update.mts'

export type RssFeedStateChange = {
  kind: 'enablement' | 'discoverability'
  enabled: boolean
}

export function omitStateChanges({
  enabled: _enabled,
  discoverable: _discoverable,
  ...fieldChanges
}: UpdateRssFeedChanges): UpdateRssFeedChanges {
  return fieldChanges
}
