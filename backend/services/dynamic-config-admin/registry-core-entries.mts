import { appAttestationConfig } from '@services/app-attestation/config'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { turnstileConfig } from '@services/captcha/config'
import { moderationConfig } from '@services/moderation/config'
import {
  DEFAULT_POST_CONTENT_LIMITS,
  POST_CONTENT_LIMITS_MAX_VALUES,
  POST_CONTENT_LIMITS_MIN_VALUES,
  postContentLimitsConfig,
} from '@services/post-content-limits'
import { recaptchaConfig } from '@services/recaptcha/config'
import { requestClientInfoConfig } from '@services/request-client-info/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import {
  validateBedrockBatchConfig,
  validateModerationConfig,
  validatePostContentLimitsConfig,
  validateRecaptchaConfig,
  validateRequestSigningModeConfig,
} from './registry-validators.mts'

export const coreDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'request-client-info',
    label: 'Request Client Information',
    description: 'Validation and enforcement for first-party API client metadata.',
    config: requestClientInfoConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enforcement_enabled: {
        description: 'Reject API requests that lack valid client and trusted device metadata.',
      },
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
        description:
          'Accept attestations created in the DCAppAttestService development environment (debug/TestFlight builds). Disable in production.',
      },
      request_signing_mode: {
        description:
          "Per-request ECDSA signing mode for attested iOS devices. 'off' = disabled; 'observe' = verify and log failures but do not block; 'enforce' = reject requests with invalid or missing signatures.",
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
        min_value: 0,
        max_value: 1,
      },
    },
    validate: validateRecaptchaConfig,
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
          min_value:
            POST_CONTENT_LIMITS_MIN_VALUES[name as keyof typeof POST_CONTENT_LIMITS_MIN_VALUES],
          max_value:
            POST_CONTENT_LIMITS_MAX_VALUES[name as keyof typeof POST_CONTENT_LIMITS_MAX_VALUES],
          integer: true,
        },
      ]),
    ),
    validate: validatePostContentLimitsConfig,
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
        min_value: 0,
        max_value: 1,
      },
    },
    validate: validateModerationConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'bedrock-embeddings-batch-config',
    label: 'Bedrock Embeddings Batch',
    description: 'Rate limits and dispatcher thresholds for Bedrock embedding batch jobs.',
    config: bedrockEmbeddingsBatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      max_inflight_jobs: bedrockField(
        'max_inflight_jobs',
        'Maximum number of Bedrock batch jobs allowed in flight simultaneously.',
      ),
      max_requests_per_hour: bedrockField(
        'max_requests_per_hour',
        'Maximum total records submitted to Bedrock batch jobs per hour.',
      ),
      max_requests_per_file: bedrockField(
        'max_requests_per_file',
        'Maximum records per individual Bedrock batch input file.',
      ),
      max_file_size_gb: bedrockField(
        'max_file_size_gb',
        'Maximum size of a single Bedrock batch input file in GB.',
      ),
      max_job_size_gb: bedrockField(
        'max_job_size_gb',
        'Maximum total in-flight Bedrock batch input size in GB.',
      ),
      min_records_per_job: bedrockField(
        'min_records_per_job',
        'Minimum records required to create a Bedrock batch job.',
      ),
      backlog_threshold: bedrockField(
        'backlog_threshold',
        'Single-embedding queue depth that triggers Bedrock batch creation dispatcher.',
      ),
      stale_ttl_hours: bedrockField(
        'stale_ttl_hours',
        'Hours after which an in-progress Bedrock batch job is considered stale and cancelled.',
      ),
    },
    validate: validateBedrockBatchConfig,
  }),
]

function bedrockField(key: keyof typeof BEDROCK_BATCH_MAX_VALUES, description: string) {
  return {
    description,
    min_value: 1,
    max_value: BEDROCK_BATCH_MAX_VALUES[key],
    integer: true,
  }
}
