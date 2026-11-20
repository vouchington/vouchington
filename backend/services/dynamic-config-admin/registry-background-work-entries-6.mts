import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  urlsDomainsBlacklistWorkConfig,
  urlsDomainsBlacklistWorkMaxValues,
} from '@services/urls-domains-blacklist/work-limits'
import {
  classifierRunsWorkConfig,
  classifierRunsWorkMaxValues,
} from '@services/classifier-runs/work-limits'
import {
  autotaggerAgentWorkConfig,
  autotaggerAgentWorkMaxValues,
} from '@services/autotagger/agent/work-limits'
import { classifiersWorkConfig, classifiersWorkMaxValues } from '@services/classifiers/work-limits'
import {
  electionsVotesWorkConfig,
  electionsVotesWorkMaxValues,
} from '@services/elections-votes/work-limits'
import {
  entityRelationsWorkConfig,
  entityRelationsWorkMaxValues,
} from '@services/entity-relations/work-limits'

export const backgroundWorkRegistryEntries6 = {
  'urls-domains-blacklist-work-config': defineBoundedWorkNamespace({
    namespace: 'urls-domains-blacklist-work-config',
    config: urlsDomainsBlacklistWorkConfig,
    label: 'Urls domains blacklist',
    maxValues: urlsDomainsBlacklistWorkMaxValues,
    descriptions: {
      email_bloom_batch_size: 'Email bloom batch size for urls domains blacklist processing.',
      bloom_batch_size: 'Bloom batch size for urls domains blacklist processing.',
      blocklist_bloom_visibility_retries:
        'Rebuild retries while the replica has not yet replayed the latest blocklist commit.',
    },
  }),
  'autotagger-agent-work-config': defineBoundedWorkNamespace({
    namespace: 'autotagger-agent-work-config',
    config: autotaggerAgentWorkConfig,
    label: 'Autotagger agent',
    maxValues: autotaggerAgentWorkMaxValues,
    descriptions: {
      max_candidates:
        'Most topics one reasoning autotagger run asks about; bounds the provider call, and the cut keeps the topics nearest the subject.',
      max_applied_topic_names:
        'Most already-applied topic names shown to the reasoning autotagger as context.',
    },
  }),
  'classifier-runs-work-config': defineBoundedWorkNamespace({
    namespace: 'classifier-runs-work-config',
    config: classifierRunsWorkConfig,
    label: 'Classifier runs',
    maxValues: classifierRunsWorkMaxValues,
    descriptions: {
      discovery_page_size: 'Discovery page size for classifier runs processing.',
      usage_report_max_runs:
        'Most runs one classifier usage report window may hold; a larger window is rejected, never cut short.',
    },
  }),
  'classifiers-work-config': defineBoundedWorkNamespace({
    namespace: 'classifiers-work-config',
    config: classifiersWorkConfig,
    label: 'Classifiers',
    maxValues: classifiersWorkMaxValues,
    descriptions: {
      comparison_max_batches: 'Comparison max batches for classifiers processing.',
    },
  }),
  'elections-votes-work-config': defineBoundedWorkNamespace({
    namespace: 'elections-votes-work-config',
    config: electionsVotesWorkConfig,
    label: 'Elections votes',
    maxValues: electionsVotesWorkMaxValues,
    descriptions: {
      primary_refresh_batch_size: 'Primary refresh batch size for elections votes processing.',
      vote_drift_sample_size: 'Posts inspected by one vote drift reconciliation page.',
      vote_drift_votes_per_post: 'Vote rows inspected before a post is reported as capped.',
    },
  }),
  'entity-relations-work-config': defineBoundedWorkNamespace({
    namespace: 'entity-relations-work-config',
    config: entityRelationsWorkConfig,
    label: 'Entity relations',
    maxValues: entityRelationsWorkMaxValues,
    descriptions: {
      alias_resolution_batch_size: 'Alias resolution batch size for entity relations processing.',
    },
  }),
}
