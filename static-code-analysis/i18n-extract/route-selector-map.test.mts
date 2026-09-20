import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chromeSelectorId, routeSelectorId } from '@vouchington/localization'
import { clearFakeGitEnv, installFakeGit } from 'vouchington-tooling/shared-context'
import { globalChromeFiles } from './global-chrome-files.mts'
import { assertCatalogAliases } from './route-alias-map-assembly.mts'
import { assembleRouteAliasMap } from './route-selector-map.mts'
import { renderSource } from './route-selector-output.mts'
import { discoverRoutes } from './route-tree.mts'

async function withRoutes(
  files: Record<string, string>,
  test: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'route-alias-test-'))
  const binDir = await mkdtemp(join(tmpdir(), 'route-alias-bin-'))
  const originalPath = process.env.PATH
  try {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), content)
    }
    installFakeGit({
      binDir,
      repoRoot: root,
      trackedFiles: Object.keys(files),
      pathPrefix: originalPath,
    })
    await test(root)
  } finally {
    process.env.PATH = originalPath
    clearFakeGitEnv()
    await rm(root, { recursive: true, force: true })
    await rm(binDir, { recursive: true, force: true })
  }
}

describe('exact web route aliases', () => {
  it('assembles shared copy into chrome and keeps page copy in its route', () => {
    const result = assembleRouteAliasMap(
      new Set(['nav.home', 'extracted.one.page.title', 'extracted.two.page.title']),
      [
        { pattern: '/one', aliases: new Set(['nav.home', 'extracted.one.page.title']) },
        { pattern: '/two', aliases: new Set(['nav.home', 'extracted.two.page.title']) },
      ],
      [],
    )

    expect(result.chrome).toEqual(['nav.home'])
    expect(result.routes).toEqual([
      {
        pattern: '/one',
        selectorId: routeSelectorId('/one', ['extracted.one.page.title']),
        aliases: ['extracted.one.page.title'],
      },
      {
        pattern: '/two',
        selectorId: routeSelectorId('/two', ['extracted.two.page.title']),
        aliases: ['extracted.two.page.title'],
      },
    ])
  })

  it('changes only the affected route selector when route membership changes', () => {
    const before = assembleRouteAliasMap(
      new Set(['extracted.one.page.title', 'extracted.two.page.title']),
      [
        { pattern: '/one', aliases: new Set(['extracted.one.page.title']) },
        { pattern: '/two', aliases: new Set(['extracted.two.page.title']) },
      ],
      [],
    )
    const after = assembleRouteAliasMap(
      new Set([
        'extracted.one.page.title',
        'extracted.one.page.subtitle',
        'extracted.two.page.title',
      ]),
      [
        {
          pattern: '/one',
          aliases: new Set(['extracted.one.page.title', 'extracted.one.page.subtitle']),
        },
        { pattern: '/two', aliases: new Set(['extracted.two.page.title']) },
      ],
      [],
    )

    expect(after.chromeSelector).toBe(before.chromeSelector)
    expect(after.routes[0]?.selectorId).not.toBe(before.routes[0]?.selectorId)
    expect(after.routes[1]?.selectorId).toBe(before.routes[1]?.selectorId)
    expect(after.routes[0]?.aliases).toContain('extracted.one.page.subtitle')
  })

  it('changes chrome and only routes whose membership loses a promoted alias', () => {
    const before = assembleRouteAliasMap(
      new Set(['nav.home', 'extracted.one.page.title', 'extracted.two.page.title']),
      [
        { pattern: '/one', aliases: new Set(['nav.home', 'extracted.one.page.title']) },
        { pattern: '/two', aliases: new Set(['extracted.two.page.title']) },
      ],
      [],
    )
    const after = assembleRouteAliasMap(
      new Set(['nav.home', 'extracted.one.page.title', 'extracted.two.page.title']),
      [
        { pattern: '/one', aliases: new Set(['nav.home', 'extracted.one.page.title']) },
        { pattern: '/two', aliases: new Set(['nav.home', 'extracted.two.page.title']) },
      ],
      [],
    )

    expect(before.chromeSelector).toBe(chromeSelectorId([]))
    expect(after.chromeSelector).toBe(chromeSelectorId(['nav.home']))
    expect(after.routes[0]?.selectorId).not.toBe(before.routes[0]?.selectorId)
    expect(after.routes[1]?.selectorId).toBe(before.routes[1]?.selectorId)
    expect(after.routes).toEqual([
      {
        pattern: '/one',
        selectorId: routeSelectorId('/one', ['extracted.one.page.title']),
        aliases: ['extracted.one.page.title'],
      },
      {
        pattern: '/two',
        selectorId: routeSelectorId('/two', ['extracted.two.page.title']),
        aliases: ['extracted.two.page.title'],
      },
    ])
  })

  it('renders whether each route has route-local membership', () => {
    expect(
      renderSource('web.chrome.example', [
        { pattern: '/empty', selectorId: 'web.route.empty', aliases: [] },
        {
          pattern: '/copy',
          selectorId: 'web.route.copy',
          aliases: ['extracted.copy.title'],
        },
      ]),
    ).toContain('hasMembership: false')
    expect(
      renderSource('web.chrome.example', [
        {
          pattern: '/copy',
          selectorId: 'web.route.copy',
          aliases: ['extracted.copy.title'],
        },
      ]),
    ).toContain('hasMembership: true')
  })

  it('keeps catalog aliases out of chrome unless a route or global source quotes them', () => {
    const result = assembleRouteAliasMap(
      new Set(['nav.home', 'extracted.chat.chatsSidebarGroup.item.title']),
      [
        { pattern: '/one', aliases: new Set(['nav.home']) },
        { pattern: '/two', aliases: new Set(['nav.home']) },
      ],
      [],
    )

    expect(result.chrome).toEqual(['nav.home'])
  })

  it('fails closed when a quoted alias is not a catalog member', () => {
    expect(() =>
      assertCatalogAliases(['extracted.missing.alias', 'nav.home'], new Set(['nav.home'])),
    ).toThrow('Quoted alias literals are not web catalog aliases: extracted.missing.alias')
  })

  it('discovers route ancestors and global chrome boundaries without graph analysis', async () => {
    await withRoutes(
      {
        'web/app/layout.ts': 'export default function Layout() {}\n',
        'web/app/one/page.ts': 'export default function One() {}\n',
        'web/app/two/page.ts': 'export default function Two() {}\n',
        'web/app/forbidden.tsx': 'export default function Forbidden() {}\n',
        'web/app/unauthorized.tsx': 'export default function Unauthorized() {}\n',
        'web/app/not-found.tsx': 'export default function NotFound() {}\n',
        'web/components/navbar.tsx': 'export default function Navbar() {}\n',
      },
      async root => {
        await expect(discoverRoutes(root, 'web/app')).resolves.toEqual([
          {
            pattern: '/one',
            files: ['web/app/layout.ts', 'web/app/not-found.tsx', 'web/app/one/page.ts'],
          },
          {
            pattern: '/two',
            files: ['web/app/layout.ts', 'web/app/not-found.tsx', 'web/app/two/page.ts'],
          },
        ])
        await expect(
          globalChromeFiles(root, 'web/app', 'web/components/navbar.tsx'),
        ).resolves.toEqual([
          'web/app/forbidden.tsx',
          'web/app/not-found.tsx',
          'web/app/unauthorized.tsx',
          'web/components/navbar.tsx',
        ])
      },
    )
  })
})
