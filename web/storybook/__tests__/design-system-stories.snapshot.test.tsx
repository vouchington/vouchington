import { readdirSync, readFileSync } from 'node:fs'
import { isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import expectedStoriesJson from './design-system-stories.expected.json' with { type: 'json' }
import forbiddenImportsJson from './design-system-stories.forbidden-imports.json' with { type: 'json' }

import { AutocompleteShowcase } from '../design-system/autocomplete-showcase'
import { ComponentsShowcase } from '../design-system/components-showcase'
import { FoundationsShowcase } from '../design-system/foundations-showcase'
import { ShellShowcase } from '../design-system/shell-showcase'
import { StorybookProviders } from '../entities/storybook-providers'

const storyModuleFiles = readdirSync('web/storybook/design-system')
  .filter(file => file.endsWith('.stories.ts') || file.endsWith('.stories.tsx'))
  .toSorted()
const storyFiles = storyModuleFiles.map(file => `web/storybook/design-system/${file}`)
const forbiddenImports = forbiddenImportsJson as readonly string[]
const expectedStories = expectedStoriesJson as Record<string, readonly string[]>

type StoryRecord = { render?: () => unknown } & Record<string, unknown>

function isStoryWithRender(value: unknown): value is { render: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoryRecord).render === 'function'
  )
}

const storyModules = import.meta.glob('../design-system/*.stories.{ts,tsx}', {
  eager: true,
}) as Record<string, Record<string, StoryRecord | unknown>>

function loadStoryModule(file: string): Record<string, StoryRecord | unknown> {
  const storyModule = storyModules[`../design-system/${file}`]
  if (!storyModule) throw new Error(`Missing Storybook module for ${file}`)
  return storyModule
}

describe('design system Storybook coverage', () => {
  it('snapshots the migrated design system story surfaces', () => {
    const surfaces = [
      {
        name: 'foundations',
        markup: renderToStaticMarkup(<FoundationsShowcase />),
        expectedText: ['Colors', 'Typography', 'Spacing'],
      },
      {
        name: 'components',
        markup: renderToStaticMarkup(<ComponentsShowcase />),
        expectedText: ['Buttons', 'Badges', 'Form Elements', 'Dropdown Menu'],
      },
      {
        name: 'autocomplete',
        markup: renderToStaticMarkup(<AutocompleteShowcase />),
        expectedText: [
          'Topic Autocomplete',
          'Tag Autocomplete (Topics)',
          'Tag Autocomplete (Posts)',
          'Tag Autocomplete (URLs)',
          'User Autocomplete',
          'Post Autocomplete',
        ],
      },
      {
        name: 'shell',
        markup: renderToStaticMarkup(<ShellShowcase />),
        expectedText: ['What this story validates', 'Shell Test Aside'],
      },
    ].map(surface => ({
      name: surface.name,
      expectedTextPresent: surface.expectedText.map(text => surface.markup.includes(text)),
    }))

    expect(surfaces).toMatchInlineSnapshot(`
      [
        {
          "expectedTextPresent": [
            true,
            true,
            true,
          ],
          "name": "foundations",
        },
        {
          "expectedTextPresent": [
            true,
            true,
            true,
            true,
          ],
          "name": "components",
        },
        {
          "expectedTextPresent": [
            true,
            true,
            true,
            true,
            true,
            true,
          ],
          "name": "autocomplete",
        },
        {
          "expectedTextPresent": [
            true,
            true,
          ],
          "name": "shell",
        },
      ]
    `)
  })

  it('keeps migrated design system stories pure and route-free', () => {
    expect(storyModuleFiles).toEqual(Object.keys(expectedStories).toSorted())

    const forbiddenImportViolations: Array<{ file: string; forbidden: string }> = []
    const missingExports: Array<{ file: string; exportName: string }> = []
    for (const file of storyFiles) {
      const source = readFileSync(file, 'utf8')
      const fileName = file.replace('web/storybook/design-system/', '')
      for (const forbidden of forbiddenImports) {
        const sidebarStoryUsesItsProvider =
          fileName === 'sidebar.stories.tsx' && forbidden === 'SidebarProvider'
        if (sidebarStoryUsesItsProvider) continue
        if (source.includes(forbidden)) forbiddenImportViolations.push({ file, forbidden })
      }
      const requiredExports = expectedStories[fileName] ?? []
      for (const exportName of requiredExports) {
        if (!source.includes(`export const ${exportName}`))
          missingExports.push({ file, exportName })
      }
    }
    expect(forbiddenImportViolations).toEqual([])
    expect(missingExports).toEqual([])
  })

  it('imports each migrated design system story module', () => {
    const missingExports: Array<{ file: string; exportName: string }> = []
    for (const file of storyModuleFiles) {
      const storyModule = loadStoryModule(file)
      expect(storyModule.default).toBeDefined()
      for (const exportName of expectedStories[file] ?? []) {
        if (!Object.hasOwn(storyModule, exportName)) missingExports.push({ file, exportName })
      }
    }
    expect(missingExports).toEqual([])
  })

  it('renders each new primitive story without throwing', () => {
    const newPrimitiveFiles = storyModuleFiles.filter(
      file =>
        file !== 'autocomplete.stories.ts' &&
        file !== 'components.stories.ts' &&
        file !== 'foundations.stories.ts' &&
        file !== 'shell.stories.ts',
    )

    const invalidRenders: Array<{ file: string; exportName: string }> = []
    for (const file of newPrimitiveFiles) {
      const storyModule = loadStoryModule(file)
      for (const [exportName, exportValue] of Object.entries(storyModule)) {
        if (exportName === 'default') continue
        if (!isStoryWithRender(exportValue)) continue
        const rendered = exportValue.render()
        if (!isValidElement(rendered)) invalidRenders.push({ file, exportName })
        renderToStaticMarkup(<StorybookProviders>{rendered as ReactElement}</StorybookProviders>)
      }
    }
    expect(invalidRenders).toEqual([])
  })
})
