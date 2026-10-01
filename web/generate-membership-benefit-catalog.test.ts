import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'
import { generateMembershipBenefitCatalog } from './generate-membership-benefit-catalog.ts'

describe('membership benefit build artifact', () => {
  let directory: string
  let output: URL
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'membership-benefits-'))
    output = pathToFileURL(join(directory, 'catalog.json'))
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it('generates the validated current catalog and detects stale output', () => {
    generateMembershipBenefitCatalog(output)
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(membershipBenefitCatalog)
    expect(() => generateMembershipBenefitCatalog(output, true)).not.toThrow()
    writeFileSync(output, '{}\n')
    expect(() => generateMembershipBenefitCatalog(output, true)).toThrow('artifact is stale')
  })

  it('fails instead of silently accepting a missing or unwritable artifact', () => {
    expect(() => generateMembershipBenefitCatalog(output, true)).toThrow('ENOENT')
    const missingParent = pathToFileURL(join(directory, 'missing', 'catalog.json'))
    expect(() => generateMembershipBenefitCatalog(missingParent)).toThrow('ENOENT')
  })

  it('keeps the checkout artifact synchronized with the canonical producer', () => {
    expect(() =>
      generateMembershipBenefitCatalog(
        pathToFileURL(
          resolve('web/components/memberships/membership-benefit-catalog.generated.json'),
        ),
        true,
      ),
    ).not.toThrow()
  })
})
