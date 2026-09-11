// Pure formatting helpers for component-story-coverage.test.ts assertions.
// Extracted so the message format can be unit-tested independently.

export const EXCLUSIONS_FILE = 'web/storybook/__tests__/component-story-exclusions.json'

export interface MissingComponent {
  component: string
  export: string
  file: string
}

export interface NamespaceImport {
  file: string
  source: string
  local: string
}

export function formatMissingComponentsMessage(missingComponents: MissingComponent[]): string {
  if (missingComponents.length === 0) return ''
  const lines: string[] = [
    `${missingComponents.length} component(s) with data-pw have no Storybook coverage.`,
    '',
    `For each missing component, add a story in web/storybook/ that imports the component via its @/ alias.`,
    '',
    `Use 'default' for default exports when matching the key reported below.`,
    `The zero-exclusion ratchet rejects entries in ${EXCLUSIONS_FILE}.`,
    '',
    `Missing components:`,
  ]
  for (const { component, export: exportName, file } of missingComponents) {
    lines.push(`  ${component} — ${file}#${exportName}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function formatNamespaceImportsMessage(namespaceImports: NamespaceImport[]): string {
  if (namespaceImports.length === 0) return ''
  const lines: string[] = [
    `${namespaceImports.length} story file(s) use namespace imports (* as ...) from web/components/ — individual component coverage cannot be tracked:`,
    '',
  ]
  for (const { file, source, local } of namespaceImports) {
    lines.push(`  ${file}: import * as ${local} from '${source}'`)
  }
  lines.push('')
  lines.push(`Fix: replace namespace imports with named imports for the specific components used.`)
  return lines.join('\n')
}
