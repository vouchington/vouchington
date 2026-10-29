import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { membershipBenefitCatalog } from '@ts-shared/utils/membership-benefit-catalog'

const fs = vi.hoisted(() => ({
  existsSync: vi.fn<typeof import('node:fs').existsSync>(),
  readFileSync: vi.fn<typeof import('node:fs').readFileSync>(),
  writeFileSync: vi.fn<typeof import('node:fs').writeFileSync>(),
}))
// The command only uses these three exports; Vitest cannot preserve readFileSync's overloads.
vi.mock(import('node:fs'), () => fs as unknown as typeof import('node:fs'))

const originalArgv = process.argv

describe('membership benefit build artifact command', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    process.argv = [process.execPath, 'generate-membership-benefit-catalog.ts']
    fs.existsSync.mockReturnValue(false)
  })
  afterEach(() => {
    process.argv = originalArgv
  })

  it('writes the current catalog and accepts it in check mode without writing again', async () => {
    await vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
      './generate-membership-benefit-catalog.ts',
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(URL),
      `${JSON.stringify(membershipBenefitCatalog, null, 2)}\n`,
    )
    expect(fs.writeFileSync.mock.calls[0]?.[0].toString()).toMatch(
      /components\/memberships\/membership-benefit-catalog.generated.json$/,
    )
    fs.readFileSync.mockReturnValue(JSON.stringify(membershipBenefitCatalog))
    process.argv.push('--check')
    vi.resetModules()
    await vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
      './generate-membership-benefit-catalog.ts',
    )
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale artifact in check mode without replacing it', async () => {
    fs.readFileSync.mockReturnValue('{}')
    process.argv.push('--check')
    await expect(
      vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
        './generate-membership-benefit-catalog.ts',
      ),
    ).rejects.toThrow('Membership benefit artifact is stale')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('surfaces read, write and malformed-artifact failures', async () => {
    process.argv.push('--check')
    fs.readFileSync.mockImplementationOnce(() => {
      throw new Error('artifact read failed')
    })
    await expect(
      vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
        './generate-membership-benefit-catalog.ts',
      ),
    ).rejects.toThrow('artifact read failed')
    process.argv.pop()
    vi.resetModules()
    fs.writeFileSync.mockImplementationOnce(() => {
      throw new Error('artifact write failed')
    })
    await expect(
      vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
        './generate-membership-benefit-catalog.ts',
      ),
    ).rejects.toThrow('artifact write failed')
    vi.resetModules()
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue('not JSON')
    await expect(
      vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
        './generate-membership-benefit-catalog.ts',
      ),
    ).rejects.toThrow(SyntaxError)
  })

  it('preserves current formatted bytes and replaces a stale artifact', async () => {
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify(membershipBenefitCatalog))
    await vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
      './generate-membership-benefit-catalog.ts',
    )
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    vi.resetModules()
    fs.readFileSync.mockReturnValue('{}')
    await vi.importActual<typeof import('./generate-membership-benefit-catalog.ts')>(
      './generate-membership-benefit-catalog.ts',
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(URL),
      `${JSON.stringify(membershipBenefitCatalog, null, 2)}\n`,
    )
  })
})
