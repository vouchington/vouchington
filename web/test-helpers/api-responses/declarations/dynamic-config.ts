import nativeCaptchaConfigDefault from '../../../../api-fixtures/v1/responses/native.captcha-config.default.json'
import nativeDynamicConfigHistoryDefault from '../../../../api-fixtures/v1/responses/native.dynamic-config.history.default.json'
import nativeDynamicConfigNamespaceInteger from '../../../../api-fixtures/v1/responses/native.dynamic-config.namespace.integer.json'
import nativeDynamicConfigNamespacesDeveloper from '../../../../api-fixtures/v1/responses/native.dynamic-config.namespaces.developer.json'
import nativeDynamicConfigNamespaceString from '../../../../api-fixtures/v1/responses/native.dynamic-config.namespace.string.json'
import nativeDynamicConfigNamespaceTyped from '../../../../api-fixtures/v1/responses/native.dynamic-config.namespace.typed.json'
import nativeDynamicConfigUpdateChanged from '../../../../api-fixtures/v1/responses/native.dynamic-config.update.changed.json'
import nativeDynamicConfigUpdateNoOp from '../../../../api-fixtures/v1/responses/native.dynamic-config.update.no-op.json'
import nativeFeatureFlagsDefault from '../../../../api-fixtures/v1/responses/native.feature-flags.default.json'
import type { CaptchaConfigResponse } from '@/lib/api/client/captcha-config'
import type {
  DynamicConfigHistoryEntry,
  DynamicConfigNamespace,
  DynamicConfigNamespaceSummary,
} from '@/lib/api/client/dynamic-config'
import type { FeatureFlagsResponse } from '@/lib/api/client/feature-flags'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const DYNAMIC_CONFIG_DECLARATIONS = [
  defineWebApiFixture<CaptchaConfigResponse>()(
    'native.captcha-config.default',
    nativeCaptchaConfigDefault,
    context => context.client.captchaConfig.fetchCaptchaConfig(),
  ),
  defineWebApiFixture<{ history: DynamicConfigHistoryEntry[] }>()(
    'native.dynamic-config.history.default',
    nativeDynamicConfigHistoryDefault,
    context => context.client.dynamicConfig.fetchDynamicConfigNamespaceHistory('feature-flags'),
  ),
  defineWebApiFixture<{ namespace: DynamicConfigNamespace }>()(
    'native.dynamic-config.namespace.integer',
    nativeDynamicConfigNamespaceInteger,
    context =>
      context.client.dynamicConfig.fetchDynamicConfigNamespace('post-content-limits-config'),
  ),
  defineWebApiFixture<{ namespace: DynamicConfigNamespace }>()(
    'native.dynamic-config.namespace.string',
    nativeDynamicConfigNamespaceString,
    context => context.client.dynamicConfig.fetchDynamicConfigNamespace('app-attestation-config'),
  ),
  defineWebApiFixture<{ namespace: DynamicConfigNamespace }>()(
    'native.dynamic-config.namespace.typed',
    nativeDynamicConfigNamespaceTyped,
    context => context.client.dynamicConfig.fetchDynamicConfigNamespace('recaptcha-config'),
  ),
  defineWebApiFixture<{
    namespaces: DynamicConfigNamespaceSummary[]
  }>()(
    'native.dynamic-config.namespaces.developer',
    nativeDynamicConfigNamespacesDeveloper,
    context => context.client.dynamicConfig.fetchDynamicConfigNamespaces(),
  ),
  defineWebApiFixture<{
    changed: boolean
    namespace: DynamicConfigNamespace
  }>()('native.dynamic-config.update.changed', nativeDynamicConfigUpdateChanged, context =>
    context.client.dynamicConfig.updateDynamicConfigNamespace('feature-flags', { fediverse: true }),
  ),
  defineWebApiFixture<{
    changed: boolean
    namespace: DynamicConfigNamespace
  }>()('native.dynamic-config.update.no-op', nativeDynamicConfigUpdateNoOp, context =>
    context.client.dynamicConfig.updateDynamicConfigNamespace('feature-flags', {
      fediverse: false,
    }),
  ),
  defineWebApiFixture<FeatureFlagsResponse>()(
    'native.feature-flags.default',
    nativeFeatureFlagsDefault,
    context => context.client.featureFlags.getFeatureFlagsClient(),
    [context => context.server.featureFlags.getFeatureFlags()],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
