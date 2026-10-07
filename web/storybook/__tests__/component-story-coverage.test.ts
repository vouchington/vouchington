import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import excludedComponentReasonsJson from './component-story-exclusions.json' with { type: 'json' }
import { analyzeStorybookSources } from '../../test-helpers/storybook/component-story-coverage/analysis'
import { componentExports } from '../../test-helpers/storybook/component-story-coverage/source'
import { workspaceFiles } from '../../test-helpers/storybook/component-story-coverage/workspace'
import {
  coveredComponentKeys,
  namespaceComponentImports,
  reachableStorybookFiles,
} from '../../test-helpers/storybook/component-story-coverage/keys'
import {
  formatMissingComponentsMessage,
  formatNamespaceImportsMessage,
} from '../../test-helpers/storybook/component-story-coverage/message'

const excludedComponentReasons = excludedComponentReasonsJson as Record<string, string>

describe('component Storybook coverage helpers', () => {
  let root: string
  let analysis: Awaited<ReturnType<typeof analyzeStorybookSources>>
  const files = [
    'web/components/example.tsx',
    'web/components/default-value.tsx',
    'web/components/barrel.ts',
    'web/storybook/example.stories.tsx',
    'web/storybook/story-data.ts',
  ]

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'story-coverage-'))
    const sources: Record<string, string> = {
      'web/components/example.tsx': `
        export type Props = { label: string }
        export function Named() { return <div data-pw="named" /> }
        export const ConstComponent = () => <div data-pw="const" />
        export default function DefaultThing() { return <div data-pw="default" /> }
        const Internal = () => <div data-pw="internal" />
        export { Internal as LocalAlias }
        export enum ComponentState { Ready }
        export const notAComponent = 1
      `,
      'web/components/default-value.tsx': `
        const lowerCase = () => <div data-pw="lower" />
        export default lowerCase
      `,
      'web/components/barrel.ts': `
        export { Named as Card } from './example'
        export type { Props } from './example'
        export { notAComponent as Unused } from './example'
      `,
      'web/storybook/example.stories.tsx': `
        import DefaultThing from '@/components/example'
        import LowerCase from '@/components/default-value'
        import { Card, type Props, Unused } from '@/components/barrel'
        import * as Components from '@/components/example'
        import { storyData } from './story-data'
        function shadow(Unused: string) { return Unused }
        export const Basic = { render: () => <><Card /><DefaultThing /><LowerCase />{storyData}<Components.Named /></> }
      `,
      'web/storybook/story-data.ts': `export const storyData = 'fixture'`,
    }
    for (const [file, source] of Object.entries(sources)) {
      const target = join(root, file)
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, source)
    }
    analysis = await analyzeStorybookSources(files, root)
  })

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('covers runtime exports and used bindings while retaining namespace restrictions', () => {
    const { graph, modules } = analysis
    const stories = reachableStorybookFiles(files, graph)
    expect(stories).toEqual(['web/storybook/example.stories.tsx', 'web/storybook/story-data.ts'])
    expect(componentExports(files, modules, root).map(component => component.key)).toEqual([
      'web/components/example.tsx#Named',
      'web/components/example.tsx#ConstComponent',
      'web/components/example.tsx#default',
      'web/components/example.tsx#LocalAlias',
      'web/components/example.tsx#ComponentState',
      'web/components/default-value.tsx#default',
    ])
    expect(
      graph
        .runtimeImports('web/storybook/example.stories.tsx')
        .flatMap(entry => entry.bindings.map(binding => binding.local)),
    ).toEqual(['DefaultThing', 'LowerCase', 'Card', 'Components', 'storyData'])
    expect([...coveredComponentKeys(stories, graph)].toSorted()).toEqual([
      'web/components/barrel.ts#Card',
      'web/components/default-value.tsx#default',
      'web/components/example.tsx#Named',
      'web/components/example.tsx#default',
    ])
    expect(namespaceComponentImports(stories, graph)).toEqual([
      {
        file: 'web/storybook/example.stories.tsx',
        source: '@/components/example',
        local: 'Components',
      },
    ])
  })

  it('rejects incomplete native module facts', async () => {
    const file = 'web/storybook/broken.stories.tsx'
    await writeFile(join(root, file), 'export const Broken = <')
    await expect(analyzeStorybookSources([file], root)).rejects.toThrow(
      'Incomplete source module facts',
    )
  })
})

describe('component Storybook coverage', () => {
  it('covers exported reusable web components from Storybook stories', async () => {
    const files = workspaceFiles()
    const { graph, modules } = await analyzeStorybookSources(files)
    const components = componentExports(files, modules)
    const storyFiles = reachableStorybookFiles(files, graph)
    const coveredKeys = coveredComponentKeys(storyFiles, graph)
    const excludedKeys = new Set(Object.keys(excludedComponentReasons))
    const nonEmptyExclusions = [...excludedKeys].toSorted()

    const namespaceImports = namespaceComponentImports(storyFiles, graph)
    const missingComponents = components
      .filter(component => !coveredKeys.has(component.key))
      .filter(component => !excludedKeys.has(component.key))
      .map(component => ({
        component: component.displayName,
        export: component.exportName,
        file: component.file,
      }))
      .toSorted((a, b) => a.file.localeCompare(b.file) || a.export.localeCompare(b.export))

    if (namespaceImports.length > 0) console.error(formatNamespaceImportsMessage(namespaceImports))
    expect(namespaceImports).toEqual([])

    if (nonEmptyExclusions.length > 0) {
      console.error(
        [
          `${nonEmptyExclusions.length} component Storybook exclusion(s) remain after the zero-exclusion ratchet:`,
          ...nonEmptyExclusions.map(key => `  - ${key}`),
          'Add direct Storybook coverage instead of adding exclusions.',
        ].join('\n'),
      )
    }
    expect(nonEmptyExclusions).toEqual([])

    if (missingComponents.length > 0)
      console.error(formatMissingComponentsMessage(missingComponents))
    expect(missingComponents).toEqual([])
  })
})
