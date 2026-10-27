import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import type { DynamicConfigLike } from '@vouchington/dynamic-config'

export function defineBoundedWorkNamespace(options: {
  namespace: string
  config: DynamicConfigLike
  label: string
  maxValues: Record<string, number>
  minValues?: Record<string, number>
  descriptions: Record<string, string>
}) {
  const { namespace, config, label, maxValues, minValues, descriptions } = options
  if (config.key !== `dynamic-config:${namespace}`)
    throw new TypeError('Bounded work namespace must match its DynamicConfig key')
  const fields = Object.keys(config.defaultFields).toSorted()
  if (JSON.stringify(fields) !== JSON.stringify(Object.keys(maxValues).toSorted()))
    throw new TypeError('Bounded work maxima must cover exactly the configured fields')
  if (minValues && Object.keys(minValues).some(field => !fields.includes(field)))
    throw new TypeError('Bounded work minima contain an unknown field')
  for (const field of fields) {
    const value = config.defaultFields[field]
    const maximum = maxValues[field]
    const minimum = minValues?.[field] ?? 1
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      !Number.isSafeInteger(minimum) ||
      minimum < 1 ||
      minimum > value ||
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
          minValue: minValues?.[field] ?? 1,
          maxValue: maxValues[field],
          integer: true,
        },
      ]),
    ),
  })
}
