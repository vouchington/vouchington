import { writeNativeResourceFiles } from '../ts-shared/ui-messages/native-resource-writer.mts'
import { generateNativeResourceFiles } from '../ts-shared/ui-messages/native-resources.mts'
import { isAbsolute, resolve } from 'node:path'
import type { NativeConsumerManifestEntry } from '../ts-shared/ui-messages/native-consumer-manifest.mts'
import type { NativeCatalogs } from '../ts-shared/ui-messages/native-resource-catalog.mts'

type NativeLocalizationInputs = Readonly<{
  manifest?: readonly NativeConsumerManifestEntry[]
  catalogs?: NativeCatalogs
}>

export async function runNativeLocalization(
  argv: readonly string[],
  inputs: NativeLocalizationInputs = {},
): Promise<void> {
  const args = [...argv]
  if (args.length === 1 && args[0] === '--validate') {
    generateNativeResourceFiles(inputs)
    return
  }

  const outputRoot = optionalAbsolutePath(args, '--output-root')
  const consumerRoot = optionalAbsolutePath(args, '--consumer-root')
  const check = removeFlag(args, '--check')
  if (args.length !== 0) throw new Error(usage())
  if (outputRoot === undefined || consumerRoot === undefined) throw new Error(usage())
  await writeNativeResourceFiles({
    outputRoot,
    consumerRoot,
    check,
    ...inputs,
  })
}

function optionalAbsolutePath(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.trim() === '' || value.includes('\0') || !isAbsolute(value)) {
    throw new Error(usage())
  }
  args.splice(index, 2)
  const result = resolve(value)
  if (result === resolve('/')) throw new Error(`${flag} must not be the filesystem root`)
  return result
}

function removeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag)
  if (index === -1) return false
  args.splice(index, 1)
  return true
}

function usage(): string {
  return (
    'Usage: node dev/native-localization.mts --validate\n' +
    'Usage: node dev/native-localization.mts --output-root <absolute-path> --consumer-root <absolute-path> [--check]'
  )
}

if (import.meta.main) {
  await runNativeLocalization(process.argv.slice(2))
}
