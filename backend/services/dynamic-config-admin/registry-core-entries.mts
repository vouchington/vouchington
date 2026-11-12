import { retainedBedrockRegistryEntry } from './registry-bedrock-retained-entry.mts'
import { communityAgentPromptsRegistryEntry } from './registry-community-agent-prompts-entry.mts'
import { appAttestationConfig } from '@services/app-attestation/config'
import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import { turnstileConfig } from '@services/captcha/config'
import { moderationConfig } from '@services/moderation/config'
import { admissionLimitRegistryEntries } from './registry-community-membership-entry.mts'
import {
  DEFAULT_POST_CONTENT_LIMITS,
  POST_CONTENT_LIMITS_MAX_VALUES,
  POST_CONTENT_LIMITS_MIN_VALUES,
  postContentLimitsConfig,
} from '@services/post-content-limits'
import { recaptchaConfig } from '@services/recaptcha/config'
import { requestClientInfoConfig } from '@services/request-client-info/config'
import { validateGeminiBatchConfig } from './registry-gemini-validator.mts'
import { geminiField } from './registry-gemini-field.mts'
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
  defineDynamicConfigNamespace({
    namespace: 'post-content-limits-config',
    label: 'Post Content Limits',
    description: 'Limits for topic IDs and review ratings in post payloads.',
    config: postContentLimitsConfig,
    access: { update_roles: ['moderator'] },
    fields: Object.fromEntries(
      Object.keys(DEFAULT_POST_CONTENT_LIMITS).map(name => [
        name,
        {
          description:
            name === 'data_point_topic_ids_max_items'
              ? 'Maximum topic IDs allowed in one data point payload.'
              : 'Maximum review topic ratings allowed in one review payload.',
          minValue:
            POST_CONTENT_LIMITS_MIN_VALUES[name as keyof typeof POST_CONTENT_LIMITS_MIN_VALUES],
          maxValue:
            POST_CONTENT_LIMITS_MAX_VALUES[name as keyof typeof POST_CONTENT_LIMITS_MAX_VALUES],
          integer: true,
        },
      ]),
    ),
  }),
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
  defineDynamicConfigNamespace({
    namespace: 'gemini-embeddings-batch-config',
    label: 'Vertex Embeddings Batch',
    description: 'Rate limits and dispatcher thresholds for Vertex embedding batch jobs.',
    config: geminiEmbeddingsBatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      creation_lease_retry_delay_ms: geminiField(
        'creation_lease_retry_delay_ms',
        'Base delay before retrying a creation job whose global lease is held elsewhere.',
      ),
      creation_lease_renewal_interval_ms: geminiField(
        'creation_lease_renewal_interval_ms',
        'Interval for detecting loss of the global creation lease and renewing its ownership.',
        100,
      ),
      creation_retry_delay_ms: geminiField(
        'creation_retry_delay_ms',
        'Delay before retrying a capacity-denied creation job.',
      ),
      bloom_population_batch_size: geminiField(
        'bloom_population_batch_size',
        'Embedding hashes per bloom population chunk.',
      ),
      batch_listing_page_size: geminiField(
        'batch_listing_page_size',
        'Maximum active or stale batches admitted per fixed-cutoff listing page.',
      ),
      reconciliation_page_size: geminiField(
        'reconciliation_page_size',
        'Completed embedding jobs per reconciliation page.',
      ),
      max_inflight_jobs: geminiField(
        'max_inflight_jobs',
        'Maximum number of Vertex batch jobs allowed in flight simultaneously.',
      ),
      max_requests_per_hour: geminiField(
        'max_requests_per_hour',
        'Maximum total records submitted to Vertex batch jobs per hour.',
      ),
      max_requests_per_file: geminiField(
        'max_requests_per_file',
        'Maximum records per individual Vertex batch input file.',
      ),
      max_file_size_gb: geminiField(
        'max_file_size_gb',
        'Maximum size of a single Vertex batch input file in GB.',
      ),
      max_job_size_gb: geminiField(
        'max_job_size_gb',
        'Maximum total in-flight Vertex batch input size in GB.',
      ),
      cursor_batch_size: geminiField(
        'cursor_batch_size',
        'Maximum text/crawl candidates per cursor fetch.',
      ),
      image_cursor_batch_size: geminiField(
        'image_cursor_batch_size',
        'Maximum image candidates per cursor fetch.',
      ),
      max_scan_rows_per_run: geminiField(
        'max_scan_rows_per_run',
        'Maximum scanned candidates per run; must cover the minimum records per job.',
      ),
      min_records_per_job: geminiField(
        'min_records_per_job',
        'Minimum records required to create a Vertex batch job.',
      ),
      backlog_threshold: geminiField('backlog_threshold', 'Queue depth to start batch jobs.'),
      stale_ttl_hours: geminiField(
        'stale_ttl_hours',
        'Hours after which an in-progress Vertex batch job is considered stale and cancelled.',
      ),
    },
    validate: validateGeminiBatchConfig,
  }),
]
