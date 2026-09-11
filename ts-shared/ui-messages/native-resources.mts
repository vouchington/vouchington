import {
  NATIVE_CONSUMER_MANIFEST,
  type NativeConsumerManifestEntry,
} from './native-consumer-manifest.mts'
import {
  DEFAULT_NATIVE_CATALOGS,
  NATIVE_RESOURCE_LOCALES,
  validateNativeManifestCatalogs,
  type NativeCatalogs,
} from './native-resource-catalog.mts'
import {
  renderNativeDotnetDescriptors,
  renderNativeDotnetKeys,
  renderNativeResx,
  renderNativeSwiftDescriptors,
  renderNativeSwiftKeys,
  renderNativeSwiftStrings,
} from './native-resource-renderers.mts'

export type GeneratedNativeResource = Readonly<{ path: string; content: string }>

export function generateNativeResourceFiles(options?: {
  manifest?: readonly NativeConsumerManifestEntry[]
  catalogs?: NativeCatalogs
}): GeneratedNativeResource[] {
  const manifest = options?.manifest ?? NATIVE_CONSUMER_MANIFEST
  const catalogs = options?.catalogs ?? DEFAULT_NATIVE_CATALOGS
  validateNativeManifestCatalogs(manifest, catalogs)
  const files = NATIVE_RESOURCE_LOCALES.flatMap(locale => [
    {
      path: `swift-clients/ui/Sources/VouchaLocalization/Generated/Resources/${locale}.lproj/Localizable.strings`,
      content: renderNativeSwiftStrings('swift', locale, manifest, catalogs),
    },
    {
      path: `dotnet-clients/src/Voucha.Client.Core/Localization/Generated/UiMessages${locale === 'en' ? '' : `.${locale}`}.resx`,
      content: renderNativeResx('dotnet', locale, manifest, catalogs),
    },
  ])
  files.push(
    {
      path: 'swift-clients/ui/Sources/VouchaLocalization/Generated/UiMessageKey.swift',
      content: renderNativeSwiftKeys(manifest),
    },
    {
      path: 'swift-clients/ui/Sources/VouchaLocalization/Generated/UiMessageDescriptor.swift',
      content: renderNativeSwiftDescriptors(manifest, catalogs),
    },
    {
      path: 'dotnet-clients/src/Voucha.Client.Core/Localization/Generated/UiMessageKey.g.cs',
      content: renderNativeDotnetKeys(manifest),
    },
    {
      path: 'dotnet-clients/src/Voucha.Client.Core/Localization/Generated/UiMessageDescriptor.g.cs',
      content: renderNativeDotnetDescriptors(manifest, catalogs),
    },
  )
  return files.toSorted((left, right) => compareCodePoints(left.path, right.path))
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
