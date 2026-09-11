import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { NativeProductSource } from './native-consumer-usage.mts'

const execFileAsync = promisify(execFile)

export async function readNativeProductSources(root: string): Promise<NativeProductSource[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  )
  const paths = stdout
    .toString('utf8')
    .split('\0')
    .filter(path => path !== '' && isProductSource(path) && existsSync(join(root, path)))
  return Promise.all(
    paths.toSorted(compareCodePoints).map(async path => ({
      path,
      content: await readFile(join(root, path), 'utf8'),
    })),
  )
}

export function isSwiftProductSource(path: string): boolean {
  return (
    path.endsWith('.swift') &&
    (path.startsWith('swift-clients/apps/') || path.startsWith('swift-clients/ui/Sources/')) &&
    !path.includes('/VouchaLocalization/Generated/')
  )
}

export function isDotnetCsharpProductSource(path: string): boolean {
  return (
    path.startsWith('dotnet-clients/src/') &&
    path.endsWith('.cs') &&
    !path.includes('/Localization/Generated/')
  )
}

export function isDotnetXamlProductSource(path: string): boolean {
  return path.startsWith('dotnet-clients/src/Voucha.Client.App/') && path.endsWith('.xaml')
}

function isProductSource(path: string): boolean {
  return (
    isSwiftProductSource(path) ||
    isDotnetCsharpProductSource(path) ||
    isDotnetXamlProductSource(path)
  )
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
