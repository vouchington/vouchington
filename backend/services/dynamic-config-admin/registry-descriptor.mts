import type { DynamicConfigRegistryEntry } from './types.mts'

export type DynamicConfigFieldMetadataByName = DynamicConfigRegistryEntry['fields']

export type DynamicConfigNamespaceDescriptor = Omit<DynamicConfigRegistryEntry, 'fields'> & {
  fields: DynamicConfigFieldMetadataByName
}

export function defineDynamicConfigNamespace(
  descriptor: DynamicConfigNamespaceDescriptor,
): DynamicConfigRegistryEntry {
  assertMetadataMatchesConfig(descriptor)
  return descriptor
}

function assertMetadataMatchesConfig(descriptor: DynamicConfigNamespaceDescriptor): void {
  const runtimeFields = new Set(Object.keys(descriptor.config.fieldTypes))
  const metadataFields = new Set(Object.keys(descriptor.fields))
  const missingMetadata = [...runtimeFields].filter(name => !metadataFields.has(name))
  const extraMetadata = [...metadataFields].filter(name => !runtimeFields.has(name))

  if (missingMetadata.length > 0 || extraMetadata.length > 0) {
    const details = [
      missingMetadata.length > 0 ? `missing metadata: ${missingMetadata.join(', ')}` : null,
      extraMetadata.length > 0 ? `extra metadata: ${extraMetadata.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('; ')
    throw new Error(`DynamicConfig metadata drift for ${descriptor.namespace}: ${details}`)
  }
}
