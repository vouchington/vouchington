import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VITEST_NAME_RE = /\bname:\s*(['"])([^'"]+)\1/g
const PROJECT_FILE_SUFFIX = 'projects.mts'

export type RepositoryCommandCatalog = {
  pathExists: (repoPath: string) => boolean
  scriptsIn: (packageDir: string) => Set<string> | undefined
  vitestProjects: Set<string>
}

function repositoryRoot(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)))
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function scriptsFromPackageJson(path: string): Set<string> | undefined {
  const manifest = readJsonObject(path)
  if (manifest === undefined) return undefined
  const scripts = manifest.scripts
  if (scripts === undefined) return new Set()
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return undefined
  return new Set(Object.keys(scripts))
}

function collectVitestProjectNames(root: string): Set<string> {
  const names = new Set<string>()
  const sources = [join(root, 'vitest.config.mts')]
  const configDir = join(root, 'test-helpers/vitest-config')
  if (existsSync(configDir)) {
    for (const file of readdirSync(configDir).sort()) {
      if (file.endsWith(PROJECT_FILE_SUFFIX) || file === 'storybook-browser-project.mts') {
        sources.push(join(configDir, file))
      }
    }
  }
  for (const source of sources) {
    if (!existsSync(source)) continue
    const text = readFileSync(source, 'utf8')
    for (const match of text.matchAll(VITEST_NAME_RE)) names.add(match[2])
  }
  return names
}

export function loadRepositoryCommandCatalog(root = repositoryRoot()): RepositoryCommandCatalog {
  const scriptCache = new Map<string, Set<string> | undefined>()
  return {
    vitestProjects: collectVitestProjectNames(root),
    scriptsIn(packageDir: string): Set<string> | undefined {
      const key = packageDir
      if (!scriptCache.has(key)) {
        scriptCache.set(key, scriptsFromPackageJson(join(root, packageDir, 'package.json')))
      }
      return scriptCache.get(key)
    },
    pathExists(repoPath: string): boolean {
      const trimmed = repoPath.replace(/^\.\//, '')
      const resolved = resolve(root, trimmed)
      const fromRoot = relative(root, resolved)
      if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return false
      return existsSync(resolved)
    },
  }
}
