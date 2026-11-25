import {
  syncGeneratedNativeFiles,
  type GeneratedNativeFile,
} from '@vouchington/localization-compiler'

import {
  NATIVE_CONSUMER_MANIFEST,
  type NativeConsumerManifestEntry,
} from './native-consumer-manifest.mts'
import { readNativeProductSources } from './native-consumer-source-discovery.mts'
import { validateNativeConsumerUsage } from './native-consumer-usage.mts'
import type { NativeCatalogs } from './native-resource-catalog.mts'
import { generateNativeResourceFiles } from './native-resources.mts'

const GENERATED_ROOTS = [
  'swift-clients/ui/Sources/VouchaLocalization/Generated',
  'dotnet-clients/src/Voucha.Client.Core/Localization/Generated',
]

export async function writeNativeResourceFiles(options: {
  outputRoot: string
  consumerRoot?: string
  check: boolean
  files?: readonly GeneratedNativeFile[]
  manifest?: readonly NativeConsumerManifestEntry[]
  catalogs?: NativeCatalogs
}): Promise<void> {
  const manifest = options.manifest ?? NATIVE_CONSUMER_MANIFEST
  if (options.files === undefined) {
    if (options.consumerRoot === undefined) {
      throw new Error('Native localization consumer root is required')
    }
    validateNativeConsumerUsage(manifest, await readNativeProductSources(options.consumerRoot))
  }
  const files =
    options.files ??
    generateNativeResourceFiles({
      manifest,
      catalogs: options.catalogs,
    })
  await syncGeneratedNativeFiles({
    outputRoot: options.outputRoot,
    files,
    check: options.check,
    generatedRoots: GENERATED_ROOTS,
  })
}
