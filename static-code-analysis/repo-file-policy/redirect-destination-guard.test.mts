import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkRedirectDestinations } from './redirect-destination-guard.mts'

describe('ownerPrivatePaths redirect remnant', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-redirect-destination-guard-'))
    testDirs.push(dir)
    return dir
  }

  async function write(repoRoot: string, path: string, content: string): Promise<void> {
    await mkdir(dirname(join(repoRoot, path)), { recursive: true })
    await writeFile(join(repoRoot, path), content)
  }

  const configWithTuples = `
  const nextConfig = {
    async redirects() {
      const ownerPrivatePaths: Array<[string, string]> = [
        ['posts/saved', 'my/posts/saved'],
      ]
      return [
        { source: '/how-it-works', destination: '/', permanent: true },
        ...ownerPrivatePaths.map(([src, dst]) => ({
          source: \`/user/:id/\${src}\`,
          destination: \`/\${dst}\`,
          permanent: false,
        })),
      ]
    },
    async rewrites() { return [] }
  }
  export default nextConfig
  `

  it('errors when an ownerPrivatePaths destination has no matching page', async () => {
    const repoRoot = await makeRepo()
    await write(repoRoot, 'web/next.config.ts', configWithTuples)
    await write(repoRoot, 'web/app/page.tsx', 'export default function Page() {}')
    const trackedFiles = ['web/next.config.ts', 'web/app/page.tsx']
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/my/posts/saved')
    expect(errors[0]).toContain('file=web/next.config.ts')
  })

  it('strips route-group segments when building routeSet', async () => {
    const repoRoot = await makeRepo()
    await write(repoRoot, 'web/next.config.ts', configWithTuples)
    await write(repoRoot, 'web/app/page.tsx', 'export default function Page() {}')
    await write(
      repoRoot,
      'web/app/(my)/my/posts/saved/page.tsx',
      'export default function Page() {}',
    )
    const trackedFiles = [
      'web/next.config.ts',
      'web/app/page.tsx',
      'web/app/(my)/my/posts/saved/page.tsx',
    ]
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toEqual([])
  })

  it('fires extractor-stale error when ownerPrivatePaths present but no tuples matched', async () => {
    const repoRoot = await makeRepo()
    await write(
      repoRoot,
      'web/next.config.ts',
      `
      const nextConfig = {
        async redirects() {
        const ownerPrivatePaths = generatePaths()
        return [{ source: '/how-it-works', destination: '/', permanent: true }]
        },
        async rewrites() { return [] }
      }
      export default nextConfig
      `,
    )
    await write(repoRoot, 'web/app/page.tsx', 'export default function Page() {}')
    const trackedFiles = ['web/next.config.ts', 'web/app/page.tsx']
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('extractor')
    expect(errors[0]).toContain('ownerPrivatePaths')
  })

  it('does not fire for a page on disk but absent from trackedFiles', async () => {
    const repoRoot = await makeRepo()
    await write(repoRoot, 'web/next.config.ts', configWithTuples)
    await write(repoRoot, 'web/app/page.tsx', 'export default function Page() {}')
    await write(
      repoRoot,
      'web/app/(my)/my/posts/saved/page.tsx',
      'export default function Page() {}',
    )
    const trackedFiles = ['web/next.config.ts', 'web/app/page.tsx']
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/my/posts/saved')
  })

  it('is a no-op when config has no redirects() body', async () => {
    const repoRoot = await makeRepo()
    await write(repoRoot, 'web/next.config.ts', 'const config = {}; export default config')
    const trackedFiles = ['web/next.config.ts']
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toEqual([])
  })

  it('is a no-op when web/next.config.ts is absent from trackedFiles', async () => {
    const repoRoot = await makeRepo()
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, [], errors)
    expect(errors).toEqual([])
  })

  it('does not treat non-ownerPrivatePaths two-string tuples as destinations', async () => {
    const repoRoot = await makeRepo()
    await write(
      repoRoot,
      'web/next.config.ts',
      `
      const nextConfig = {
        async redirects() {
        const ownerPrivatePaths: Array<[string, string]> = [
          ['posts/saved', 'my/posts/saved'],
        ]
        const lookup: Array<[string, string]> = [
          ['key', 'unrouted-value'],
        ]
        return [
          { source: '/how-it-works', destination: '/', permanent: true },
          ...ownerPrivatePaths.map(([src, dst]) => ({
            source: \`/user/:id/\${src}\`,
            destination: \`/\${dst}\`,
            permanent: false,
          })),
        ]
        },
        async rewrites() { return [] }
      }
      export default nextConfig
      `,
    )
    await write(repoRoot, 'web/app/page.tsx', 'export default function Page() {}')
    await write(
      repoRoot,
      'web/app/(my)/my/posts/saved/page.tsx',
      'export default function Page() {}',
    )
    const trackedFiles = [
      'web/next.config.ts',
      'web/app/page.tsx',
      'web/app/(my)/my/posts/saved/page.tsx',
    ]
    const errors: string[] = []
    checkRedirectDestinations(repoRoot, trackedFiles, errors)
    expect(errors).toEqual([])
  })
})
