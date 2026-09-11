import { describe, expect, it } from 'vitest'

import { collectPackageGatesFromFile } from './package-gates.mts'
import type { PackageGateInventoryRow } from './types.mts'

function collect(source: string): PackageGateInventoryRow[] {
  const gates = new Map<string, PackageGateInventoryRow>()
  collectPackageGatesFromFile('pnpm-workspace.yaml', source, gates)
  return [...gates.values()].toSorted((a, b) => a.name.localeCompare(b.name))
}

describe('collectPackageGatesFromFile', () => {
  it('collects scalar, array, and object YAML values with comments and CRLF', () => {
    const gates = collect(
      [
        '# package gates for inventory',
        'allowBuilds:',
        '  sharp: true',
        '  "@ghostery/adblocker-puppeteer@*": false',
        'minimumReleaseAge: 2880',
        'minimumReleaseAgeExclude:',
        '  - valkyries',
        '  - "another-package"',
        'ignoredOptionalDependencies:',
        '  - sharp',
        'packageExtensions:',
        '  "@ghostery/adblocker-puppeteer@*":',
        '    peerDependencies:',
        '      puppeteer:',
        '        optional: true',
        'strictDepBuilds: true',
      ].join('\r\n'),
    )

    expect(gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'allowBuilds',
          values: ['sharp', '@ghostery/adblocker-puppeteer@*'],
        }),
        expect.objectContaining({ name: 'minimumReleaseAge', values: ['2880'] }),
        expect.objectContaining({ name: 'ignoredOptionalDependencies', values: ['sharp'] }),
        expect.objectContaining({
          name: 'minimumReleaseAgeExclude',
          values: ['valkyries', 'another-package'],
        }),
        expect.objectContaining({
          name: 'packageExtensions',
          values: ['@ghostery/adblocker-puppeteer@*'],
        }),
        expect.objectContaining({ name: 'strictDepBuilds', values: ['true'] }),
      ]),
    )
  })

  it('ignores malformed and non-object pnpm-workspace.yaml files', () => {
    expect(collect('allowBuilds: [\n')).toEqual([])
    expect(collect('true\n')).toEqual([])
  })

  it('ignores package gate YAML in other files', () => {
    const gates = new Map<string, PackageGateInventoryRow>()
    collectPackageGatesFromFile('package.json', 'minimumReleaseAge: 2880', gates)
    expect([...gates.values()]).toEqual([])
  })
})
