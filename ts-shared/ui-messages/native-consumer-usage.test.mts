import { describe, expect, it } from 'vitest'

import type { NativeConsumerManifestEntry } from './native-consumer-manifest.mts'
import {
  canonicalNativeKey,
  validateNativeConsumerUsage,
  type NativeProductSource,
} from './native-consumer-usage.mts'

function entry(
  key: string,
  consumers: NativeConsumerManifestEntry['consumers'],
): NativeConsumerManifestEntry {
  return { key, consumers }
}

function source(path: string, content: string): NativeProductSource {
  return { path, content }
}

describe('native consumer usage manifest', () => {
  it('accepts real Swift, C#, and XAML product consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift', 'dotnet']), entry('counts.items', ['dotnet'])],
        [
          source('swift-clients/ui/Sources/Feature/View.swift', 'Text(localize(.commonCancel))'),
          source(
            'dotnet-clients/src/Voucha.Client.Core/Feature.cs',
            'Localize(UiMessageKey.CommonCancel)',
          ),
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<Label Text="{app:UiLocalizedValue Path=Count, Format=message:counts.items|number}" />',
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('rejects a product key that is missing from the manifest', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [],
        [
          source(
            'swift-clients/ui/Sources/Feature/View.swift',
            'Text(localize(UiMessageKey.nativeFeatureMissing))',
          ),
        ],
      ),
    ).toThrow('unknown swift typed message key "nativeFeatureMissing"')
  })

  it('rejects unknown Swift shorthand keys instead of silently ignoring them', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [],
        [source('swift-clients/ui/Sources/Feature/View.swift', 'Text(localize(.navTypo))')],
      ),
    ).toThrow('unknown swift typed message key "navTypo"')
  })

  it('ignores key-shaped text in Swift and C# comments and string literals', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [],
        [
          source(
            'swift-clients/ui/Sources/Feature/View.swift',
            '// UiMessageKey.nativeTypo\nlet text = ".navTypo"\n/* .settingsTypo */',
          ),
          source(
            'dotnet-clients/src/Voucha.Client.Core/Feature.cs',
            '// UiMessageKey.NativeTypo\nvar text = "UiMessageKey.NativeTypo";',
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('discovers C# keys inside interpolated-string expressions without scanning literal text', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['dotnet'])],
        [
          source(
            'dotnet-clients/src/Voucha.Client.Core/Feature.cs',
            [
              'var text = $"UiMessageKey.NativeTypo {localization.Localize(UiMessageKey.CommonCancel)}";',
            ].join('\n'),
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('rejects C# static UiMessageKey imports so bare references cannot evade discovery', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['dotnet'])],
        [
          source(
            'dotnet-clients/src/Voucha.Client.Core/Feature.cs',
            [
              'using static Voucha.Client.Core.Localization.UiMessageKey;',
              'var key = CommonCancel;',
            ].join('\n'),
          ),
        ],
      ),
    ).toThrow('must qualify UiMessageKey references instead of using a static import')
  })

  it('rejects an unused platform claim', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift', 'dotnet'])],
        [source('swift-clients/ui/Sources/Feature/View.swift', 'Text(localize(.commonCancel))')],
      ),
    ).toThrow('unused dotnet manifest claim "common.cancel"')
  })

  it('does not treat unrelated Swift members as typed localization consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift'])],
        [source('swift-clients/ui/Sources/Feature/View.swift', 'let color = Palette.commonCancel')],
      ),
    ).toThrow('unused swift manifest claim "common.cancel"')
  })

  it('does not treat unrelated Swift shorthand enum members as typed localization consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift'])],
        [
          source(
            'swift-clients/ui/Sources/Feature/View.swift',
            'let color: Palette = .commonCancel',
          ),
        ],
      ),
    ).toThrow('unused swift manifest claim "common.cancel"')
  })

  it.each([
    'let key: UiMessageKey? = .commonCancel',
    'let key: VouchaLocalization.UiMessageKey = .commonCancel',
  ])('accepts normalized Swift message-key type shorthand: %s', declaration => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift'])],
        [source('swift-clients/ui/Sources/Feature/View.swift', declaration)],
      ),
    ).not.toThrow()
  })

  it('does not treat XAML comments as product consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['dotnet'])],
        [
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<ContentPage><!-- <Button Text="{DynamicResource common.cancel}" /> --></ContentPage>',
          ),
        ],
      ),
    ).toThrow('unused dotnet manifest claim "common.cancel"')
  })

  it('accepts Swift message wrappers as typed localization consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift'])],
        [
          source(
            'swift-clients/ui/Sources/Feature/View.swift',
            'let title: UiVerbatimText = .message(.commonCancel)',
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('accepts labeled and explicitly typed Swift message-key consumers', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('native.feature.title', ['swift'])],
        [
          source(
            'swift-clients/ui/Sources/Feature/View.swift',
            [
              'let row = Row(title: .nativeFeatureTitle)',
              'let title: UiMessageKey = .nativeFeatureTitle',
            ].join('\n'),
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('rejects native keys whose generated identifiers collide', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('native.feature-title', ['swift']), entry('native.feature.title', ['swift'])],
        [],
      ),
    ).toThrow(
      'Native swift key identifier "nativeFeatureTitle" collides for "native.feature-title" and "native.feature.title"',
    )
  })

  it('rejects a key used by the wrong platform', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['swift'])],
        [
          source('swift-clients/ui/Sources/Feature/View.swift', 'Text(localize(.commonCancel))'),
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<Button Text="{DynamicResource common.cancel}" />',
          ),
        ],
      ),
    ).toThrow('but the manifest claims only swift')
  })

  it('rejects unknown XAML resource keys', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [],
        [
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<Button Text="{DynamicResource missing.key}" />',
          ),
        ],
      ),
    ).toThrow('unknown dotnet XAML message key "missing.key"')
  })

  it('maps generated descriptor variants back to their manifest leaf', () => {
    expect(canonicalNativeKey('counts.items.__plural.one')).toBe('counts.items')
    expect(canonicalNativeKey('counts.items.__select.member.other')).toBe('counts.items')
    expect(() =>
      validateNativeConsumerUsage(
        [entry('counts.items', ['dotnet'])],
        [
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<Label Text="{DynamicResource counts.items.__plural.one}" />',
          ),
        ],
      ),
    ).not.toThrow()
  })

  it('accepts x:Static XAML message-key references', () => {
    expect(() =>
      validateNativeConsumerUsage(
        [entry('common.cancel', ['dotnet'])],
        [
          source(
            'dotnet-clients/src/Voucha.Client.App/Feature.xaml',
            '<ContentPage xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml" xmlns:app="clr-namespace:Voucha.Client.App"><Label Text="{x:Static app:common.cancel}" /></ContentPage>',
          ),
        ],
      ),
    ).not.toThrow()
  })
})
