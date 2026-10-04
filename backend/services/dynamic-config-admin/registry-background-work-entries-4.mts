import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { oauthGithubWorkConfig, oauthGithubWorkMaxValues } from '@services/oauth-github/work-limits'
import { oauthXWorkConfig, oauthXWorkMaxValues } from '@services/oauth-x/work-limits'

export const backgroundWorkEntries4 = [
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
