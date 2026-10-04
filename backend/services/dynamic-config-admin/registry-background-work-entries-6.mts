import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  urlsDomainsBlacklistWorkConfig,
  urlsDomainsBlacklistWorkMaxValues,
} from '@services/urls-domains-blacklist/work-limits'
import {
  classifierRunsWorkConfig,
  classifierRunsWorkMaxValues,
} from '@services/classifier-runs/work-limits'
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
  'urls-domains-blacklist-work-config': defineBoundedWorkNamespace(
    urlsDomainsBlacklistWorkConfig,
    'Urls domains blacklist',
    urlsDomainsBlacklistWorkMaxValues,
    {
      email_bloom_batch_size: 'Email bloom batch size for urls domains blacklist processing.',
      bloom_batch_size: 'Bloom batch size for urls domains blacklist processing.',
    },
  ),
  'classifier-runs-work-config': defineBoundedWorkNamespace(
    classifierRunsWorkConfig,
    'Classifier runs',
    classifierRunsWorkMaxValues,
    {
      discovery_page_size: 'Discovery page size for classifier runs processing.',
    },
  ),
  'classifiers-work-config': defineBoundedWorkNamespace(
    classifiersWorkConfig,
    'Classifiers',
    classifiersWorkMaxValues,
    {
      comparison_max_batches: 'Comparison max batches for classifiers processing.',
    },
  ),
  'elections-votes-work-config': defineBoundedWorkNamespace(
    electionsVotesWorkConfig,
    'Elections votes',
    electionsVotesWorkMaxValues,
    {
      primary_refresh_batch_size: 'Primary refresh batch size for elections votes processing.',
    },
  ),
  'entity-relations-work-config': defineBoundedWorkNamespace(
    entityRelationsWorkConfig,
    'Entity relations',
    entityRelationsWorkMaxValues,
    {
      alias_resolution_batch_size: 'Alias resolution batch size for entity relations processing.',
      rss_feed_publisher_batch_size:
        'Rss feed publisher batch size for entity relations processing.',
    },
  ),
}
