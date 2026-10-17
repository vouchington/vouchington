#!/usr/bin/env node
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

// Node's resolver uses default, import, require, and node. Bundler-only
// conditions (module, esnext) and type declarations are not loaded at runtime.
const NON_RUNTIME_EXPORT_KEYS = new Set(['module', 'esnext', 'types', 'browser'])

export type OpenTelemetryPackageManifest = {
  main?: unknown
  exports?: unknown
  imports?: unknown
}

export type PruneOpenTelemetryAlternateBuildsResult = {
  bytesRemoved: number
  directoriesRemoved: number
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isUnderSrcBuild(target: string): boolean {
  return /^(?:\.\/)?build\/src(?:\/|$)/.test(path.posix.normalize(target))
}

function collectRuntimeTargets(node: unknown, targets: string[]): boolean {
  if (typeof node === 'string') {
    targets.push(node)
    return true
  }
  if (node === null || node === undefined) return true
  if (Array.isArray(node) || typeof node !== 'object') return false

  return Object.entries(node).every(
    ([key, value]) => NON_RUNTIME_EXPORT_KEYS.has(key) || collectRuntimeTargets(value, targets),
  )
}

export function alternateBuildsAreUnused(manifest: OpenTelemetryPackageManifest): boolean {
  // Private specifiers can select an alternate build without naming it in src.
  if (manifest.imports !== undefined) return false
  const main = manifest.main
  const mainIsSrc = typeof main === 'string' && isUnderSrcBuild(main)
  if (main !== undefined && !mainIsSrc) return false
  if (manifest.exports === undefined) return mainIsSrc

  const targets: string[] = []
  if (!collectRuntimeTargets(manifest.exports, targets)) return false
  if (targets.length === 0) return mainIsSrc
  return targets.every(isUnderSrcBuild)
}

async function directorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  let total = 0
  for (const entry of entries.filter(entry => entry.isFile())) {
    total += (await stat(path.join(entry.parentPath, entry.name))).size
  }
  return total
}

async function srcReferencesAlternateBuild(directory: string): Promise<boolean> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    const entryPath = path.join(entry.parentPath, entry.name)
    if (!entry.isFile()) continue
    if (!/\.(?:c|m)?js$/.test(entry.name)) continue
    const text = await readFile(entryPath, 'utf8')
    // Retain on any alternate-build name, including relative sibling imports.
    if (/\b(?:esm|esnext)\b/.test(text)) return true
  }
  return false
}

async function listOpenTelemetryPackages(storeDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(storeDir, { withFileTypes: true })
  } catch (err) {
    if (isEnoent(err)) return []
    throw err
  }

  const packages: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const scope = path.join(storeDir, entry.name, 'node_modules', '@opentelemetry')
    let names
    try {
      names = await readdir(scope)
    } catch (err) {
      if (isEnoent(err)) continue
      throw err
    }
    for (const name of names) packages.push(path.join(scope, name))
  }
  return packages
}

export async function pruneOpenTelemetryAlternateBuilds(
  prodDir: string,
): Promise<PruneOpenTelemetryAlternateBuildsResult> {
  const packages = await listOpenTelemetryPackages(path.join(prodDir, 'node_modules', '.pnpm'))
  let bytesRemoved = 0
  let directoriesRemoved = 0

  for (const packageDir of packages) {
    const srcDir = path.join(packageDir, 'build', 'src')
    const presentAlternateDirs: string[] = []
    for (const alternateDir of ['esm', 'esnext'].map(name =>
      path.join(packageDir, 'build', name),
    )) {
      try {
        const info = await stat(alternateDir)
        if (info.isDirectory()) presentAlternateDirs.push(alternateDir)
      } catch (err) {
        if (!isEnoent(err)) throw err
      }
    }
    if (presentAlternateDirs.length === 0) continue

    let manifest: OpenTelemetryPackageManifest
    try {
      manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
    } catch (err) {
      if (isEnoent(err)) continue
      throw err
    }
    if (!alternateBuildsAreUnused(manifest)) continue

    try {
      if (await srcReferencesAlternateBuild(srcDir)) continue
    } catch (err) {
      if (isEnoent(err)) continue
      throw err
    }

    for (const alternateDir of presentAlternateDirs) {
      bytesRemoved += await directorySize(alternateDir)
      await rm(alternateDir, { recursive: true })
      directoriesRemoved += 1
    }
  }

  return { bytesRemoved, directoriesRemoved }
}

async function main(): Promise<void> {
  const prodDirs = process.argv.slice(2)
  if (prodDirs.length === 0) {
    throw new Error('prune-opentelemetry-alternate-builds requires a deploy directory')
  }
  for (const prodDir of prodDirs) {
    const result = await pruneOpenTelemetryAlternateBuilds(prodDir)
    console.log(
      `Pruned OpenTelemetry alternate builds at ${prodDir} (${result.directoriesRemoved} directories, ${result.bytesRemoved} bytes)`,
    )
  }
}

if (import.meta.main) {
  await main()
}
