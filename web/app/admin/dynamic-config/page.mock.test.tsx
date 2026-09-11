import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DynamicConfigPage from './page'

const stateMocks = vi.hoisted(() => ({
  loadData: vi.fn<VitestLooseMock>(),
  selectNamespace: vi.fn<VitestLooseMock>(),
  updateField: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('./dynamic-config-state'), () => ({
  useDynamicConfigState: () => ({
    activeNamespace: 'feature-flags',
    details: null,
    history: [],
    loadData: stateMocks.loadData,
    loading: false,
    namespaces: [
      {
        namespace: 'feature-flags',
        label: 'Feature Flags',
        description: 'Runtime feature toggles',
        field_count: 1,
        can_view: true,
        can_update: true,
      },
      {
        namespace: 'recaptcha-config',
        label: 'reCAPTCHA',
        description: 'Runtime reCAPTCHA controls',
        field_count: 2,
        can_view: true,
        can_update: true,
      },
    ],
    savingFields: {},
    selectNamespace: stateMocks.selectNamespace,
    updateField: stateMocks.updateField,
  }),
}))

vi.mock(import('./namespace-panel'), () => ({
  DynamicConfigNamespacePanel: () => <div data-pw='dynamic-config-namespace-panel' />,
}))

describe('DynamicConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders and filters dynamic config namespaces', () => {
    render(<DynamicConfigPage />)

    const heading = screen.getByRole('heading', { name: 'Dynamic Config' })
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveAttribute('data-pw', 'dynamic-config-heading')
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    expect(screen.getByText('reCAPTCHA')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search namespaces' }), {
      target: { value: 'captcha' },
    })

    expect(screen.queryByText('Feature Flags')).toBeNull()
    expect(screen.getByText('reCAPTCHA')).toBeInTheDocument()
  })

  it('refreshes and selects namespaces', () => {
    render(<DynamicConfigPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: /reCAPTCHA/ }))

    expect(stateMocks.loadData).toHaveBeenCalled()
    expect(stateMocks.selectNamespace).toHaveBeenCalledWith('recaptcha-config')
  })
})
