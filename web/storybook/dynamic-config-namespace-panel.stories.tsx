import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DynamicConfigNamespacePanel } from '@/app/admin/dynamic-config/namespace-panel'

const meta = {
  title: 'Admin/Dynamic Config Namespace Panel',
  component: DynamicConfigNamespacePanel,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof DynamicConfigNamespacePanel>

export default meta
type Story = StoryObj<typeof meta>

export const FeatureFlags: Story = {
  args: {
    details: {
      namespace: 'feature-flags',
      label: 'Feature Flags',
      description: 'Runtime feature toggles with optional browser-local overrides.',
      field_count: 2,
      can_view: true,
      can_update: true,
      config: {
        memberships: true,
        private_profiles: false,
      },
      fields: [
        {
          name: 'memberships',
          type: 'boolean',
          value: true,
          default_value: false,
          description: 'Membership purchase and plan-management flows.',
        },
        {
          name: 'private_profiles',
          type: 'boolean',
          value: false,
          default_value: false,
          description: 'Private profile controls.',
        },
      ],
    },
    history: [
      {
        id: '1',
        namespace: 'feature-flags',
        changed_by: { id: 'user-1', username: 'admin' },
        previous_fields: { memberships: false, private_profiles: false },
        next_fields: { memberships: true, private_profiles: false },
        changed_fields: {
          memberships: { previous: false, next: true },
        },
        created_at: '2026-05-30T12:00:00.000Z',
      },
    ],
    loading: false,
    savingFields: {},
    updateField: async () => {},
  },
}

export const NumericConfig: Story = {
  args: {
    details: {
      namespace: 'recaptcha-config',
      label: 'reCAPTCHA',
      description: 'Runtime reCAPTCHA Enterprise assessment and blocking controls.',
      field_count: 3,
      can_view: true,
      can_update: true,
      config: {
        enabled: false,
        blocking_enabled: false,
        block_threshold: 0.75,
      },
      fields: [
        {
          name: 'enabled',
          type: 'boolean',
          value: false,
          default_value: false,
          description: 'Run reCAPTCHA assessments.',
        },
        {
          name: 'blocking_enabled',
          type: 'boolean',
          value: false,
          default_value: false,
          description: 'Block requests below the configured score.',
        },
        {
          name: 'block_threshold',
          type: 'number',
          value: 0.75,
          default_value: 0.75,
          description: 'Minimum acceptable score.',
          min_value: 0,
          max_value: 1,
        },
      ],
    },
    history: [],
    loading: false,
    savingFields: {},
    updateField: async () => {},
  },
}
