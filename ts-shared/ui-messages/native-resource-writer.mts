import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { NATIVE_CONSUMER_MANIFEST } from './native-consumer-manifest.mts'
import { readNativeProductSources } from './native-consumer-source-discovery.mts'
import { validateNativeConsumerUsage } from './native-consumer-usage.mts'
import { generateNativeResourceFiles, type GeneratedNativeResource } from './native-resources.mts'

const GENERATED_ROOTS = [
  'swift-clients/ui/Sources/VouchaLocalization/Generated',
  'dotnet-clients/src/Voucha.Client.Core/Localization/Generated',
]

export async function writeNativeResourceFiles(options: {
  outputRoot: string
  consumerRoot?: string
  check: boolean
  files?: readonly GeneratedNativeResource[]
}): Promise<void> {
  if (options.files === undefined) {
    if (options.consumerRoot === undefined) {
      throw new Error('Native localization consumer root is required')
    }
    validateNativeConsumerUsage(
      NATIVE_CONSUMER_MANIFEST,
      await readNativeProductSources(options.consumerRoot),
    )
  }
  const files = options.files ?? generateNativeResourceFiles()
  const expected = new Map(files.map(file => [file.path, file.content]))
  if (options.check) return checkFiles(options.outputRoot, expected)
  await Promise.all(
    [...expected].map(async ([path, content]) => {
      const destination = join(options.outputRoot, path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, content)
    }),
  )
}

async function checkFiles(root: string, expected: ReadonlyMap<string, string>): Promise<void> {
  const checked = await Promise.all(
    [...expected].map(async ([path, content]) => {
      try {
        return (await readFile(join(root, path), 'utf8')) === content ? null : `stale ${path}`
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return `missing ${path}`
        throw error
      }
    }),
  )
  const actual = (await Promise.all(GENERATED_ROOTS.map(path => listFiles(root, path)))).flat()
  const extra = actual.flatMap(path => (expected.has(path) ? [] : [`extra ${path}`]))
  const problems = [...checked.filter(problem => problem !== null), ...extra]
  if (problems.length > 0) {
    throw new Error(`Native localization resources are out of date:\n${problems.join('\n')}`)
  }
}

async function listFiles(root: string, directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(root, directory), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return (
    await Promise.all(
      entries.map(entry => {
        const child = join(directory, entry.name)
        return entry.isDirectory() ? listFiles(root, child) : Promise.resolve([child])
      }),
    )
  ).flat()
}
