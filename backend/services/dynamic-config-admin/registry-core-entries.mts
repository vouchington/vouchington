import { geminiBatchRegistryEntry } from './registry-gemini-entry.mts'
import { retainedBedrockRegistryEntry } from './registry-bedrock-retained-entry.mts'
import { communityAgentPromptsRegistryEntry } from './registry-community-agent-prompts-entry.mts'
import { appAttestationConfig } from '@services/app-attestation/config'
import { turnstileConfig } from '@services/captcha/config'
import { moderationConfig } from '@services/moderation/config'
import { admissionLimitRegistryEntries } from './registry-community-membership-entry.mts'
import { postContentLimitsRegistryEntry } from './registry-post-content-limits-entry.mts'
import { recaptchaConfig } from '@services/recaptcha/config'
import { requestClientInfoConfig } from '@services/request-client-info/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { validateRequestSigningModeConfig } from './product-config-validators.mts'

export const coreDynamicConfigRegistryEntries = [
  ...admissionLimitRegistryEntries,
  communityAgentPromptsRegistryEntry,
  defineDynamicConfigNamespace({
    namespace: 'request-client-info',
    label: 'Request Client Information',
    description: 'Validation and enforcement for first-party API client metadata.',
    config: requestClientInfoConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enforcement_enabled: { description: 'Require valid client and trusted device metadata.' },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'app-attestation-config',
    label: 'App Attestation',
    description: 'Apple App Attest verification controls for the iOS app.',
    config: appAttestationConfig,
    access: { update_roles: [] },
    fields: {
      enabled: { description: 'Enable Apple App Attest verification endpoints.' },
      require_attestation_for_bypass: {
        description:
          'Require a verified App Attest assertion to bypass Turnstile on gated endpoints. When false, attestation is accepted but not required.',
      },
      allow_development_attestation: {
        description: 'Accept debug/TestFlight App Attest attestations. Disable in production.',
      },
      request_signing_mode: {
        description:
          "Per-request ECDSA signing mode for attested iOS devices. 'off' = disabled; 'observe' = verify and log failures but do not block; 'enforce' = reject requests with invalid or missing signatures.",
      },
      allow_unattested_native_mcp_mint: {
        description:
          'Allow native sessions without a registered App Attest key to mint member MCP tokens. A registered key always requires a valid assertion.',
      },
    },
    validate: validateRequestSigningModeConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'recaptcha-config',
    label: 'reCAPTCHA',
    description: 'Runtime reCAPTCHA Enterprise assessment and blocking controls.',
    config: recaptchaConfig,
    access: { update_roles: [] },
    fields: {
      enabled: { description: 'Call reCAPTCHA Enterprise assessment APIs for eligible requests.' },
      blocking_enabled: { description: 'Reject low-score requests instead of logging only.' },
      block_threshold: {
        description: 'Minimum acceptable reCAPTCHA Enterprise score.',
        minValue: 0,
        maxValue: 1,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'turnstile-config',
    label: 'Turnstile',
    description: 'Staging-only Turnstile always-approve kill switch. Production ignores it.',
    config: turnstileConfig,
    access: { update_roles: [] },
    fields: {
      always_approve: { description: 'Staging skip of siteverify and missing-token checks.' },
    },
  }),
  postContentLimitsRegistryEntry,
  defineDynamicConfigNamespace({
    namespace: 'moderation-config',
    label: 'Moderation',
    description: 'AI-generated content moderation thresholds.',
    config: moderationConfig,
    access: { update_roles: ['moderator'] },
    fields: {
      ai_generated_confidence_threshold: {
        description: 'Confidence threshold above which text is flagged as AI-generated (0–1).',
        minValue: 0,
        maxValue: 1,
      },
    },
  }),
  retainedBedrockRegistryEntry,
  geminiBatchRegistryEntry,
]
