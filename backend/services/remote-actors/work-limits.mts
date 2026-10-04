import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  follower_inbox_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const remoteActorsWorkMaxValues = {
  follower_inbox_batch_size: 5000,
}

export const remoteActorsWorkConfig = new DynamicConfig({
  key: 'remote-actors-work-config',
  fieldTypes: {
    follower_inbox_batch_size: 'number',
  },
  defaultFields,
})

export function getRemoteActorsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(remoteActorsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: remoteActorsWorkMaxValues[field],
  })
}
