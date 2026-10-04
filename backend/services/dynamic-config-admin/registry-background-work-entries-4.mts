import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { oauthGithubWorkConfig, oauthGithubWorkMaxValues } from '@services/oauth-github/work-limits'
import { oauthXWorkConfig, oauthXWorkMaxValues } from '@services/oauth-x/work-limits'

export const backgroundWorkEntries4 = [
  defineBoundedWorkNamespace(
    oauthGithubWorkConfig,
    'GitHub friend updates',
    oauthGithubWorkMaxValues,
    {
      friend_mutation_batch_size: 'Friend mutation batch size for oauth github processing.',
    },
  ),
  defineBoundedWorkNamespace(oauthXWorkConfig, 'X friend updates', oauthXWorkMaxValues, {
    friend_mutation_batch_size: 'Friend mutation batch size for oauth x processing.',
  }),
]
