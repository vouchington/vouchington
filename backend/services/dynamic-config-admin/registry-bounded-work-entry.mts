import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import type { DynamicConfigLike } from './types.mts'

export function defineBoundedWorkNamespace(options: {
  namespace: string
  config: DynamicConfigLike
  label: string
  maxValues: Record<string, number>
  descriptions: Record<string, string>
}) {
  const { namespace, config, label, maxValues, descriptions } = options
  if (config.key !== `dynamic-config:${namespace}`)
    throw new TypeError('Bounded work namespace must match its DynamicConfig key')
  const fields = Object.keys(config.defaultFields).toSorted()
  if (JSON.stringify(fields) !== JSON.stringify(Object.keys(maxValues).toSorted()))
    throw new TypeError('Bounded work maxima must cover exactly the configured fields')
  for (const field of fields) {
    const value = config.defaultFields[field]
    const maximum = maxValues[field]
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      !Number.isSafeInteger(maximum) ||
      maximum! < value
    )
      throw new TypeError(`Invalid bounded work default or ceiling for ${field}`)
  }
  return defineDynamicConfigNamespace({
    namespace,
    label,
    description: `Controls background processing pages and work sizes for ${label.toLowerCase()}.`,
    config,
    access: { update_roles: ['developer'] },
    fields: Object.fromEntries(
      Object.entries(descriptions).map(([field, description]) => [
        field,
        {
          description,
          min_value: 1,
          max_value: maxValues[field],
          integer: true,
        },
      ]),
    ),
  })
}
