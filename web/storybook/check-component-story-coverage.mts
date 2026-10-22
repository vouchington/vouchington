import excludedComponentReasonsJson from './__tests__/component-story-exclusions.json' with { type: 'json' }
import { analyzeStorybookSources } from '../test-helpers/storybook/component-story-coverage/analysis.ts'
import {
  componentExports,
  repoRoot,
} from '../test-helpers/storybook/component-story-coverage/source.ts'
import { workspaceFiles } from '../test-helpers/storybook/component-story-coverage/workspace.ts'
import {
  coveredComponentKeys,
  namespaceComponentImports,
  reachableStorybookFiles,
} from '../test-helpers/storybook/component-story-coverage/keys.ts'
import {
  formatMissingComponentsMessage,
  formatNamespaceImportsMessage,
} from '../test-helpers/storybook/component-story-coverage/message.ts'

const files = workspaceFiles()
const { graph, modules } = await analyzeStorybookSources(files, repoRoot)
const components = componentExports(files, modules)
const storyFiles = reachableStorybookFiles(files, graph)
const coveredKeys = coveredComponentKeys(storyFiles, graph)
const excludedKeys = Object.keys(excludedComponentReasonsJson).toSorted()
const excludedKeySet = new Set(excludedKeys)
const namespaceImports = namespaceComponentImports(storyFiles, graph)
const missingComponents = components
  .flatMap(component =>
    coveredKeys.has(component.key) || excludedKeySet.has(component.key)
      ? []
      : [{ component: component.displayName, export: component.exportName, file: component.file }],
  )
  .toSorted((a, b) => a.file.localeCompare(b.file) || a.export.localeCompare(b.export))

if (namespaceImports.length > 0) console.error(formatNamespaceImportsMessage(namespaceImports))
if (excludedKeys.length > 0) {
  console.error(
    [
      `${excludedKeys.length} component Storybook exclusion(s) remain after the zero-exclusion ratchet:`,
      ...excludedKeys.map(key => `  - ${key}`),
      'Add direct Storybook coverage instead of adding exclusions.',
    ].join('\n'),
  )
}
if (missingComponents.length > 0) console.error(formatMissingComponentsMessage(missingComponents))
if (namespaceImports.length > 0 || excludedKeys.length > 0 || missingComponents.length > 0) {
  throw new Error('Component Storybook coverage check failed')
}
