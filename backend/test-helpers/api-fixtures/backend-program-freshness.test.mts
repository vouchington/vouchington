import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createBackendProgramCompilerHost,
  createTrackedBackendProgramForTest,
} from './backend-program.mts'
import {
  backendProgramProbesAreFresh,
  trackBackendProgramCompilerHost,
} from './backend-program-freshness.mts'

const compilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
} satisfies ts.CompilerOptions

describe('tracked backend program compiler host', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-backend-program-probes-'))
  })

  afterEach(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('includes the entry in a real TypeScript program and detects an exact source-text change', () => {
    const entry = join(root, 'entry.mts')
    writeFileSync(entry, 'export const value = 1\n')
    const { program, snapshot } = compileProgram(entry, {
      ...compilerOptions,
      noLib: true,
      types: [],
    })

    expect(program.getSourceFile(entry)).toBeDefined()
    expect(backendProgramProbesAreFresh(snapshot)).toBe(true)
    writeFileSync(entry, 'export const value = 2\n')
    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })

  it('tracks package.json decisions made by real NodeNext resolution', () => {
    const entry = join(root, 'entry.mts')
    const packageRoot = join(root, 'node_modules/example-package')
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(entry, "import 'example-package'\n")
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'example-package', types: './index.d.ts' }),
    )
    writeFileSync(join(packageRoot, 'index.d.ts'), 'export declare const value: number\n')
    const { program, snapshot } = compileProgram(entry)

    expect(
      program.getSourceFiles().some(file => file.fileName.endsWith('/example-package/index.d.ts')),
    ).toBe(true)
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'example-package', types: './other.d.ts' }),
    )
    writeFileSync(join(packageRoot, 'other.d.ts'), 'export declare const value: string\n')
    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
    expect(
      compileProgram(entry)
        .program.getSourceFiles()
        .some(file => file.fileName.endsWith('/example-package/other.d.ts')),
    ).toBe(true)
  })

  it('tracks failed file and directory lookup outcomes', () => {
    const entry = join(root, 'entry.mts')
    writeFileSync(entry, "import './missing-file.mjs'\nimport './missing-dir/value.mjs'\n")
    const missingFileSnapshot = compile(entry)
    writeFileSync(join(root, 'missing-file.mts'), 'export const found = true\n')
    expect(backendProgramProbesAreFresh(missingFileSnapshot)).toBe(false)

    rmSync(join(root, 'missing-file.mts'))
    const missingDirectorySnapshot = compile(entry)
    mkdirSync(join(root, 'missing-dir'))
    writeFileSync(join(root, 'missing-dir/value.mts'), 'export const found = true\n')
    expect(backendProgramProbesAreFresh(missingDirectorySnapshot)).toBe(false)
  })

  it('captures a read beneath a non-directory as a stable missing input', () => {
    const notDirectory = join(root, 'not-directory')
    writeFileSync(notDirectory, 'file')
    const tracker = createBackendProgramCompilerHost(compilerOptions)

    expect(tracker.host.readFile(join(notDirectory, 'missing.mts'))).toBeUndefined()
    expect(backendProgramProbesAreFresh(tracker.snapshot())).toBe(true)
  })

  it('tracks directory listing outcomes', () => {
    const entry = join(root, 'entry.mts')
    writeFileSync(entry, 'export {}\n')
    const tracker = createBackendProgramCompilerHost(compilerOptions)
    tracker.host.readDirectory?.(root, ['.mts'], [], ['**/*'])
    tracker.host.getDirectories?.(root)
    const snapshot = tracker.snapshot()
    mkdirSync(join(root, 'added-directory'))
    writeFileSync(join(root, 'added.mts'), 'export const added = true\n')
    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })

  it('tracks realpath outcomes', () => {
    const firstTarget = join(root, 'first.mts')
    const secondTarget = join(root, 'second.mts')
    const link = join(root, 'linked.mts')
    writeFileSync(firstTarget, 'export const target = 1\n')
    writeFileSync(secondTarget, 'export const target = 2\n')
    symlinkSync(firstTarget, link)
    const tracker = createBackendProgramCompilerHost(compilerOptions)
    tracker.host.realpath?.(link)
    const snapshot = tracker.snapshot()

    unlinkSync(link)
    symlinkSync(secondTarget, link)
    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })
  it('marks a build-time read mutation unstable for immediate replay', () => {
    const entry = join(root, 'entry.mts')
    writeFileSync(entry, 'export const value = 1\n')
    let changed = false
    const { probeSnapshot } = createTrackedBackendProgramForTest([entry], compilerOptions, {
      afterRead: path => {
        if (changed || path !== entry) return false
        changed = true
        writeFileSync(entry, 'export const value = 2\n')
        return false
      },
    })

    expect(probeSnapshot.stableDuringCapture).toBe(false)
    expect(backendProgramProbesAreFresh(probeSnapshot)).toBe(false)
  })
  it('preserves the concrete structural filesystem host it decorates', () => {
    const calls: string[] = []
    let directories = ['z', 'a', 'a']
    const host = {
      prefix: 'tracked:',
      fileExists(path: string) {
        calls.push(`fileExists:${this.prefix}${path}`)
        return true
      },
      readFile(path: string) {
        calls.push(`readFile:${this.prefix}${path}`)
        return undefined
      },
      getDirectories: (_path: string) => directories,
      readDirectory: (_path: string) => directories,
      customHostMethod() {
        return 'preserved'
      },
    }
    const tracker = trackBackendProgramCompilerHost(host)

    expect(tracker.host).toBe(host)
    expect(tracker.host.customHostMethod()).toBe('preserved')
    expect(tracker.host.fileExists('source.mts')).toBe(true)
    expect(tracker.host.readFile('source.mts')).toBeUndefined()
    expect(tracker.host.getDirectories?.('src')).toEqual(['z', 'a', 'a'])
    expect(tracker.host.readDirectory?.('src')).toEqual(['z', 'a', 'a'])
    expect(calls).toEqual(['fileExists:tracked:source.mts', 'readFile:tracked:source.mts'])
    const snapshot = tracker.snapshot()
    directories = ['a', 'z']
    expect(backendProgramProbesAreFresh(snapshot)).toBe(true)
    expect(calls).toEqual([
      'fileExists:tracked:source.mts',
      'readFile:tracked:source.mts',
      'fileExists:tracked:source.mts',
      'readFile:tracked:source.mts',
    ])
    directories = ['b']
    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })
  it('replays a stable virtual structural host when no disk metadata exists', () => {
    const virtualPath = join(root, 'virtual.mts')
    let contents = 'export const value = 1\n'
    const tracker = trackBackendProgramCompilerHost({
      fileExists: () => true,
      readFile: path => (path === virtualPath ? contents : undefined),
    })

    expect(tracker.host.readFile(virtualPath)).toBe(contents)
    const snapshot = tracker.snapshot()

    expect(backendProgramProbesAreFresh(snapshot)).toBe(true)
    contents = 'export const value = 2\n'

    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })
  it('replays virtual content through a symlink loop without probing disk metadata', () => {
    const loopPath = join(root, 'virtual-loop.mts')
    symlinkSync(loopPath, loopPath)
    let contents = 'export const value = 1\n'
    const tracker = trackBackendProgramCompilerHost({
      fileExists: () => true,
      readFile: path => (path === loopPath ? contents : undefined),
    })

    expect(tracker.host.readFile(loopPath)).toBe(contents)
    const snapshot = tracker.snapshot()
    contents = 'export const value = 2\n'

    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })
  it('replays overlay content when the backing disk path exists', () => {
    const overlayPath = join(root, 'overlay.mts')
    writeFileSync(overlayPath, 'export const diskValue = true\n')
    let contents = 'export const overlayValue = 1\n'
    const tracker = trackBackendProgramCompilerHost({
      fileExists: () => true,
      readFile: path => (path === overlayPath ? contents : undefined),
    })

    expect(tracker.host.readFile(overlayPath)).toBe(contents)
    const snapshot = tracker.snapshot()
    contents = 'export const overlayValue = 2\n'

    expect(backendProgramProbesAreFresh(snapshot)).toBe(false)
  })
  it('uses the metadata fast path only for explicitly disk-backed reads', () => {
    const diskPath = join(root, 'disk-backed.mts')
    writeFileSync(diskPath, 'export const value = true\n')
    let reads = 0
    const tracker = trackBackendProgramCompilerHost(
      {
        fileExists: () => true,
        readFile: path => {
          reads += 1
          return readFileSync(path, 'utf8')
        },
      },
      { readFileReplay: 'when-filesystem-metadata-stable' },
    )

    expect(tracker.host.readFile(diskPath)).toBe('export const value = true\n')
    expect(backendProgramProbesAreFresh(tracker.snapshot())).toBe(true)
    expect(reads).toBe(1)
  })
  it('treats a missing replay input as stale while preserving unexpected failures', () => {
    const missing = Object.assign(new Error('removed during replay'), { code: 'ENOENT' })
    const unexpected = new Error('unexpected replay failure')

    expect(
      backendProgramProbesAreFresh({
        probes: [
          {
            key: 'removed-input',
            replay: () => {
              throw missing
            },
            value: 'present',
          },
        ],
        stableDuringCapture: true,
      }),
    ).toBe(false)
    expect(() =>
      backendProgramProbesAreFresh({
        probes: [
          {
            key: 'failed-input',
            replay: () => {
              throw unexpected
            },
            value: 'present',
          },
        ],
        stableDuringCapture: true,
      }),
    ).toThrow(unexpected)
  })
})

function compile(entry: string) {
  return compileProgram(entry).snapshot
}

function compileProgram(entry: string, options: ts.CompilerOptions = compilerOptions) {
  const { probeSnapshot: snapshot, program } = createTrackedBackendProgramForTest([entry], options)
  return { program, snapshot }
}
