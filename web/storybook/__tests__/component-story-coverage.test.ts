import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import excludedComponentReasonsJson from './component-story-exclusions.json' with { type: 'json' }
import {
  componentExports,
  defaultComponentExports,
  namedComponentExports,
} from '../test-helpers/component-story-coverage/source'
import { workspaceFiles } from '../test-helpers/component-story-coverage/workspace'
import {
  reachableStorybookFiles,
  runtimeImports,
  usedRuntimeImports,
} from '../test-helpers/component-story-coverage/imports'
import {
  coveredComponentKeys,
  coveredComponentKeysForImport,
  namedReexportTargets,
  namespaceComponentImports,
} from '../test-helpers/component-story-coverage/keys'
import {
  formatMissingComponentsMessage,
  formatNamespaceImportsMessage,
} from '../test-helpers/component-story-coverage/message'

const excludedComponentReasons = excludedComponentReasonsJson as Record<string, string>

describe('component Storybook coverage helpers', () => {
  it('finds named and default PascalCase component exports', () => {
    const file = 'web/components/example.tsx'
    const sourceFile = ts.createSourceFile(
      file,
      `
        export function NamedComponent() { return null }
        export const ConstComponent = () => null
        export default function DefaultComponent() { return null }
        export const notAComponent = 1
        export type { TypeOnlyAlias }
        export { type TypeOnlyProps }
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )

    expect(
      [
        ...namedComponentExports(file, sourceFile),
        ...defaultComponentExports(file, sourceFile),
      ].map(component => component.key),
    ).toEqual([
      'web/components/example.tsx#NamedComponent',
      'web/components/example.tsx#ConstComponent',
      'web/components/example.tsx#default',
    ])
  })

  it('counts only runtime component imports as Storybook coverage', () => {
    const file = 'web/storybook/example.stories.tsx'
    const sourceFile = ts.createSourceFile(
      file,
      `
        import type { TypeOnlyComponent } from '@/components/type-only'
        import DefaultComponent, { NamedComponent } from '@/components/example'
        import * as NamespaceComponents from '@/components/namespace'
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const imports = runtimeImports(file, sourceFile)

    expect(imports.map(runtimeImport => [runtimeImport.imported, runtimeImport.typeOnly])).toEqual([
      ['TypeOnlyComponent', true],
      ['default', false],
      ['NamedComponent', false],
      ['*', false],
    ])
  })

  it('counts only imports referenced by a reachable story module', () => {
    const file = 'web/storybook/example.stories.tsx'
    const sourceFile = ts.createSourceFile(
      file,
      `
        import { TypeOnlyComponent, UsedComponent, UnusedComponent } from '@/components/example'

        type StoryFixture = TypeOnlyComponent

        export const Basic = {
          render: () => <UsedComponent />,
        }
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )

    expect(
      usedRuntimeImports(file, sourceFile).map(runtimeImport => runtimeImport.imported),
    ).toEqual(['UsedComponent'])
  })

  it('finds named component re-export targets from public barrels', () => {
    const file = 'web/components/ui/example-barrel.ts'
    const sourceFile = ts.createSourceFile(
      file,
      `
        export { SidebarMenuSkeleton } from './sidebar/menu-feedback'
        export { type SidebarMenuProps } from './sidebar/menu-button'
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const trackedFileSet = new Set([
      file,
      'web/components/ui/sidebar/menu-button.tsx',
      'web/components/ui/sidebar/menu-feedback.tsx',
    ])

    expect(namedReexportTargets(file, 'SidebarMenuSkeleton', trackedFileSet, sourceFile)).toEqual([
      {
        file: 'web/components/ui/sidebar/menu-feedback.tsx',
        exportName: 'SidebarMenuSkeleton',
      },
    ])
    expect(namedReexportTargets(file, 'SidebarMenuProps', trackedFileSet, sourceFile)).toEqual([])
  })

  it('counts sidebar public barrel imports as coverage for source exports', () => {
    expect(
      coveredComponentKeysForImport(
        'web/components/ui/sidebar.ts',
        'SidebarMenuSkeleton',
        new Set(workspaceFiles()),
      ),
    ).toEqual([
      'web/components/ui/sidebar.ts#SidebarMenuSkeleton',
      'web/components/ui/sidebar/menu-feedback.tsx#SidebarMenuSkeleton',
    ])
  })
})

describe('component Storybook coverage', () => {
  it('covers exported reusable web components from Storybook stories', () => {
    const files = workspaceFiles()
    const fileSet = new Set(files)
    const components = componentExports(files)
    const storyFiles = reachableStorybookFiles(files)
    const coveredKeys = coveredComponentKeys(storyFiles, fileSet)
    const excludedKeys = new Set(Object.keys(excludedComponentReasons))
    const nonEmptyExclusions = [...excludedKeys].toSorted()

    const namespaceImports = namespaceComponentImports(storyFiles, fileSet).map(runtimeImport => ({
      file: runtimeImport.file,
      source: runtimeImport.source,
      local: runtimeImport.local,
    }))
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
