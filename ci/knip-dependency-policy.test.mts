import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'

interface KnipWorkspaceConfig {
  ignoreDependencies?: string[]
}

interface KnipConfig {
  ignoreDependencies?: string[]
  workspaces?: Record<string, KnipWorkspaceConfig>
}

interface IgnoredDependencyEvidence {
  dependency: string
  evidenceFiles: readonly string[]
  evidencePattern: RegExp
}

interface FilesMatchingOptions {
  files?: readonly string[]
  workspace?: string
}

const PHANTOM_REFERENCE_FILE_NAME = 'knip-dependency-references.d.ts'
const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
const POLICY_TEST_FILE = relative(gitRoot, fileURLToPath(import.meta.url))
const ALLOWED_WORKSPACE_IGNORE_DEPENDENCIES = new Map<string, readonly IgnoredDependencyEvidence[]>(
  [
    [
      'backend/api',
      [
        {
          dependency: '@services/entity-listener-reconciliation',
          evidenceFiles: ['backend/workers/entity-listeners/processors/reconciliation.mts'],
          evidencePattern: /\bfrom '@services\/entity-listener-reconciliation'/,
        },
      ],
    ],
    [
      'backend/entrypoints/api',
      [
        {
          dependency: '@modules/bluesky-oauth',
          evidenceFiles: ['backend/api/bluesky/client-metadata.mts'],
          evidencePattern: /\bfrom '@modules\/bluesky-oauth'/,
        },
        {
          dependency: '@services/bluesky-accounts',
          evidenceFiles: ['backend/api/v1/sessions-authentication/auth-bluesky.mts'],
          evidencePattern: /\bfrom '@services\/bluesky-accounts'/,
        },
        {
          dependency: '@services/bluesky-follows',
          evidenceFiles: ['backend/api/v1/sessions-authentication/auth-bluesky.mts'],
          evidencePattern: /\bfrom '@services\/bluesky-follows'/,
        },
        {
          dependency: '@services/entity-listener-reconciliation',
          evidenceFiles: ['backend/workers/entity-listeners/processors/reconciliation.mts'],
          evidencePattern: /\bfrom '@services\/entity-listener-reconciliation'/,
        },
      ],
    ],
    [
      'cloudflare-worker',
      [
        {
          dependency: 'cloudflare',
          evidenceFiles: [
            'cloudflare-worker/src/cached-origin.mts',
            'cloudflare-worker/src/types.mts',
          ],
          evidencePattern: /\bfrom 'cloudflare:workers'/,
        },
      ],
    ],
    [
      'lambdas/image-resize',
      [
        {
          dependency: '@fontsource/inter',
          evidenceFiles: ['lambdas/image-resize/og/fonts.mts'],
          evidencePattern: /nodeRequire\.resolve\(`@fontsource\/inter/,
        },
        {
          dependency: '@types/react',
          evidenceFiles: ['lambdas/image-resize/og/render.mts'],
          evidencePattern: /@types\/react/,
        },
      ],
    ],
  ],
)
const trackedFileContentCache = new Map<string, string | undefined>()
let trackedFilesCache: string[] | undefined

function trackedFiles(): string[] {
  trackedFilesCache ??= execSync('git ls-files -z', {
    cwd: gitRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
    .toSorted()

  return trackedFilesCache
}

function knipConfig(): KnipConfig {
  return parseJsonc(readFileSync(join(gitRoot, 'knip.jsonc'), 'utf8')) as KnipConfig
}

function trackedFileContent(file: string): string | undefined {
  if (trackedFileContentCache.has(file)) return trackedFileContentCache.get(file)

  try {
    const content = readFileSync(join(gitRoot, file), 'utf8')
    trackedFileContentCache.set(file, content)
    return content
  } catch (error) {
    const code =
      error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'EISDIR' || code === 'ENOENT') {
      trackedFileContentCache.set(file, undefined)
      return undefined
    }

    throw error
  }
}

function filesMatching(pattern: RegExp, options: FilesMatchingOptions = {}): string[] {
  return (options.files ?? trackedFiles()).filter(file => {
    if (file === POLICY_TEST_FILE) return false
    if (options.workspace && !file.startsWith(`${options.workspace}/`)) return false

    const content = trackedFileContent(file)
    return content === undefined ? false : pattern.test(content)
  })
}

function ignoredDependencyImports(dependency: string, workspace?: string): string[] {
  const dependencyPattern = RegExp.escape(dependency)
  const importPattern = new RegExp(
    String.raw`(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]${dependencyPattern}(?:\/[^'"]*)?['"]`,
  )

  return filesMatching(importPattern, { workspace })
}

describe('knip dependency policy', () => {
  it('does not restore phantom dependency reference files', () => {
    const referenceFiles = trackedFiles().filter(
      file => basename(file) === PHANTOM_REFERENCE_FILE_NAME,
    )

    expect(referenceFiles).toEqual([])
  })

  it('does not use root ignoreDependencies for package-script dependencies', () => {
    expect(knipConfig().ignoreDependencies ?? []).toEqual([])
  })

  it('keeps workspace ignoreDependencies limited to documented out-of-graph edges', () => {
    const workspaceIgnores = Object.entries(knipConfig().workspaces ?? {})
      .flatMap(([workspace, config]) =>
        config.ignoreDependencies === undefined
          ? []
          : [[workspace, config.ignoreDependencies.toSorted()] as const],
      )
      .toSorted(([left], [right]) => left.localeCompare(right))

    expect(workspaceIgnores).toEqual(
      [...ALLOWED_WORKSPACE_IGNORE_DEPENDENCIES.entries()].map(
        ([workspace, allowedDependencies]) =>
          [workspace, allowedDependencies.map(({ dependency }) => dependency).toSorted()] as const,
      ),
    )

    for (const [workspace, allowedDependencies] of ALLOWED_WORKSPACE_IGNORE_DEPENDENCIES) {
      for (const { dependency, evidenceFiles, evidencePattern } of allowedDependencies) {
        expect(filesMatching(evidencePattern, { files: evidenceFiles })).toEqual(evidenceFiles)
        expect(ignoredDependencyImports(dependency, workspace)).toEqual([])
      }
    }
  })
})
