import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))

const productionSources = [
  '../get-translations.ts',
  '../load-client-messages.ts',
  '../load-server-messages.ts',
  '../catalog-from-batch.ts',
  '../report-unresolved-message.ts',
  '../ssr-localization-revision-props.mts',
  '../../../app/layout.tsx',
  '../../../app/global-error.tsx',
]

describe('production catalog loading', () => {
  it('does not statically import catalog JSON, SQLite, or locale-loader', () => {
    const joined = productionSources
      .map(relative => readFileSync(join(directory, relative), 'utf8'))
      .join('\n')
    expect(joined).not.toMatch(/localization\/catalog/)
    expect(joined).not.toMatch(/locale-loader/)
    expect(joined).not.toMatch(/locale-catalogs/)
    expect(joined).not.toMatch(/default-translator/)
    expect(joined).not.toMatch(/load-catalog-json/)
    expect(joined).not.toMatch(/extracted\.\*/)
  })
})
