import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeStorybookSources } from '../../test-helpers/storybook/component-story-coverage/analysis'
import { componentExports } from '../../test-helpers/storybook/component-story-coverage/source'
import {
  coveredComponentKeys,
  namespaceComponentImports,
  reachableStorybookFiles,
} from '../../test-helpers/storybook/component-story-coverage/keys'

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
