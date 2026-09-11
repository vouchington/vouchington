import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DynamicConfigNamespacePanel } from './namespace-panel'
import type { DynamicConfigFieldValue } from '@/lib/api/client/dynamic-config'

type UpdateField = (field: string, value: DynamicConfigFieldValue) => Promise<void>

const cookieMocks = vi.hoisted(() => ({
  emptyFeatureFlags: {},
  featureFlagOverrides: { memberships: true },
  clearAllFeatureFlagOverrides: vi.fn<VitestLooseMock>(),
  getFeatureFlagOverrides: vi.fn<VitestLooseMock>(() => ({ memberships: true })),
  getFeatureFlagServerSnapshot: vi.fn<VitestLooseMock>(() => cookieMocks.emptyFeatureFlags),
  getFeatureFlagSnapshot: vi.fn<VitestLooseMock>(() => cookieMocks.featureFlagOverrides),
  removeFeatureFlagOverride: vi.fn<VitestLooseMock>(),
  setFeatureFlagOverride: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/feature-flags/cookies'), () => cookieMocks)

const namespace = {
  namespace: 'feature-flags',
  label: 'Feature Flags',
  description: 'Runtime feature toggles',
  field_count: 2,
  can_view: true,
  can_update: true,
  config: {
    memberships: false,
    rollout_percent: 10,
  },
  fields: [
    {
      name: 'memberships',
      type: 'boolean' as const,
      value: false,
      default_value: false,
      description: 'Memberships checkout',
    },
    {
      name: 'rollout_percent',
      type: 'number' as const,
      value: 10,
      default_value: 0,
      description: 'Rollout percent',
      min_value: 0,
      max_value: 100,
      integer: true,
    },
  ],
}

function makeNamespaceWithRolloutPercent(value: number): typeof namespace {
  return {
    ...namespace,
    config: {
      ...namespace.config,
      rollout_percent: value,
    },
    fields: namespace.fields.map(field => (field.type === 'number' ? { ...field, value } : field)),
  }
}

describe('DynamicConfigNamespacePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders config fields and change history', async () => {
    render(
      <DynamicConfigNamespacePanel
        details={namespace}
        history={[
          {
            id: '1',
            namespace: 'feature-flags',
            changed_by: { id: 'user-1', username: 'admin' },
            previous_fields: { memberships: false },
            next_fields: { memberships: true },
            changed_fields: { memberships: { previous: false, next: true } },
            created_at: '2026-05-30T12:00:00.000Z',
          },
        ]}
        loading={false}
        savingFields={{}}
        updateField={vi.fn<UpdateField>()}
      />,
    )

    expect(screen.getByText('Feature Flags')).toBeDefined()
    expect(screen.getAllByText('memberships').length).toBeGreaterThan(0)
    expect(screen.getByText('rollout_percent')).toBeDefined()
    expect(screen.getByText('admin')).toBeDefined()
    await waitFor(() => expect(cookieMocks.getFeatureFlagSnapshot).toHaveBeenCalled())
  })

  it('updates boolean and number fields', async () => {
    const updateField = vi.fn<UpdateField>().mockResolvedValue(undefined)

    render(
      <DynamicConfigNamespacePanel
        details={namespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: 'memberships' }))
    expect(updateField).toHaveBeenCalledWith('memberships', true)

    const input = screen.getByRole('textbox', { name: 'rollout_percent' })
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateField).toHaveBeenCalledWith('rollout_percent', 25)
  })

  it('keeps numeric drafts when saving fails', async () => {
    const updateField = vi.fn<UpdateField>().mockRejectedValue(new Error('save failed'))

    render(
      <DynamicConfigNamespacePanel
        details={namespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'rollout_percent' })
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateField).toHaveBeenCalledWith('rollout_percent', 25))
    expect(input).toHaveValue('25')
  })

  it('resets numeric drafts from the server-normalized save response', async () => {
    const updateField = vi.fn<UpdateField>().mockResolvedValue(undefined)
    const { rerender } = render(
      <DynamicConfigNamespacePanel
        details={namespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'rollout_percent' })
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateField).toHaveBeenCalledWith('rollout_percent', 25))

    rerender(
      <DynamicConfigNamespacePanel
        details={makeNamespaceWithRolloutPercent(24)}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    await waitFor(() => expect(input).toHaveValue('24'))
  })

  it('updates string field', async () => {
    const stringNamespace = {
      ...namespace,
      config: { request_signing_mode: 'off' },
      fields: [
        {
          name: 'request_signing_mode',
          type: 'string' as const,
          value: 'off',
          default_value: 'off',
          description: 'Request signing mode',
        },
      ],
    }
    const updateField = vi.fn<UpdateField>().mockResolvedValue(undefined)

    render(
      <DynamicConfigNamespacePanel
        details={stringNamespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'request_signing_mode' }), {
      target: { value: 'observe' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateField).toHaveBeenCalledWith('request_signing_mode', 'observe'))
  })

  it('keeps string draft when saving fails', async () => {
    const stringNamespace = {
      ...namespace,
      config: { request_signing_mode: 'off' },
      fields: [
        {
          name: 'request_signing_mode',
          type: 'string' as const,
          value: 'off',
          default_value: 'off',
          description: 'Request signing mode',
        },
      ],
    }
    const updateField = vi.fn<UpdateField>().mockRejectedValue(new Error('fail'))

    render(
      <DynamicConfigNamespacePanel
        details={stringNamespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={updateField}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'request_signing_mode' })
    fireEvent.change(input, { target: { value: 'observe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateField).toHaveBeenCalledWith('request_signing_mode', 'observe'))
    expect(input).toHaveValue('observe')
  })

  it('clears local feature flag overrides', async () => {
    render(
      <DynamicConfigNamespacePanel
        details={namespace}
        history={[]}
        loading={false}
        savingFields={{}}
        updateField={vi.fn<UpdateField>()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear local overrides' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear local overrides' }))

    expect(cookieMocks.clearAllFeatureFlagOverrides).toHaveBeenCalled()
  })
})
