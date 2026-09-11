import { XMLParser, XMLValidator } from 'fast-xml-parser'

export function xamlMessageKeys(source: string): string[] {
  if (XMLValidator.validate(source) !== true) return []
  const document = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    preserveOrder: true,
  }).parse(source) as unknown[]
  const keys: string[] = []
  visitXamlStrings(document, value => {
    for (const match of value.matchAll(/\{DynamicResource\s+([^}\s]+)\}/g)) keys.push(match[1]!)
    for (const match of value.matchAll(/\bFormat=message:([^|,}\s]+)(?:\|[^,}\s]+)?/g))
      keys.push(match[1]!)
    for (const match of value.matchAll(/\{x:Static\s+(?:[A-Za-z_][\w.-]*:)?([^}\s]+)\}/g))
      keys.push(match[1]!)
  })
  return keys
}

function visitXamlStrings(nodes: unknown[], visitValue: (value: string) => void): void {
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) continue
    for (const [key, value] of Object.entries(node)) {
      if (key === '#comment') continue
      if (typeof value === 'string') visitValue(value)
      else if (Array.isArray(value)) visitXamlStrings(value, visitValue)
      else if (typeof value === 'object' && value !== null) {
        for (const attributeValue of Object.values(value)) {
          if (typeof attributeValue === 'string') visitValue(attributeValue)
        }
      }
    }
  }
}
