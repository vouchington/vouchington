import { copyrightConfig } from '@services/copyright-notices/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const copyrightRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'copyright',
  label: 'Copyright',
  description: 'Copyright notice automation and legal-operations switches.',
  config: copyrightConfig,
  access: { update_roles: ['developer'] },
  fields: {
    automaticProvisionalWithholding: {
      description:
        'Withhold the targets of a clear-screened signed-in DMCA notice before a moderator reviews it. Off keeps every notice for a moderator; read the copyright runbook before enabling.',
    },
  },
})
