import { backgroundQueueConfig, backgroundQueueMaxValues } from '@queues/background/config'
import {
  backgroundCpuQueueConfig,
  backgroundCpuQueueMaxValues,
} from '@queues/background-cpu/config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { oauthGithubWorkConfig, oauthGithubWorkMaxValues } from '@services/oauth-github/work-limits'
import { oauthXWorkConfig, oauthXWorkMaxValues } from '@services/oauth-x/work-limits'
import { sesInboundWorkConfig, sesInboundWorkMaxValues } from '@workers/ses-inbound/work-limits'

export const backgroundWorkEntries4 = [
  defineBoundedWorkNamespace({
    namespace: 'background-cpu-queue-config',
    config: backgroundCpuQueueConfig,
    label: 'Background CPU queue',
    maxValues: backgroundCpuQueueMaxValues,
    descriptions: {
      pause_recheck_ms: 'Milliseconds a paused CPU job waits before re-checking its domain.',
      pause_cache_ms: 'Milliseconds a CPU worker trusts a domain pause state.',
      domain_stats_scan_cap: 'Jobs scanned per state for one CPU domain-stats request.',
      single_backlog_scan_cap: 'Jobs scanned per state for Bedrock single admission checks.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'background-queue-config',
    config: backgroundQueueConfig,
    label: 'Background queue',
    maxValues: backgroundQueueMaxValues,
    descriptions: {
      pause_recheck_ms:
        'Milliseconds a job of a paused domain waits before it re-checks its domain.',
      pause_cache_ms:
        'Milliseconds a worker trusts a domain pause state before it reads PostgreSQL.',
      domain_stats_scan_cap:
        'Jobs scanned per domain and state for one operator domain-stats request.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'ses-inbound-work-config',
    config: sesInboundWorkConfig,
    label: 'SES inbound reconciliation',
    maxValues: sesInboundWorkMaxValues,
    descriptions: {
      reconcile_max_pages_per_run: 'Maximum S3 copyright inbox pages per reconciliation job.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'oauth-github-work-config',
    config: oauthGithubWorkConfig,
    label: 'GitHub friend updates',
    maxValues: oauthGithubWorkMaxValues,
    descriptions: {
      friend_mutation_batch_size: 'Friend mutation batch size for oauth github processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'oauth-x-work-config',
    config: oauthXWorkConfig,
    label: 'X friend updates',
    maxValues: oauthXWorkMaxValues,
    descriptions: {
      friend_mutation_batch_size: 'Friend mutation batch size for oauth x processing.',
    },
  }),
]
