import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TotpSetupFlow, type TotpSetupData } from '@/components/my/totp-manager/setup-flow'

function makeSetupData(): TotpSetupData {
  return {
    authenticator: {
      id: 'authenticator-1',
      created_at: '2026-06-14T00:00:00.000Z',
      name: 'Test authenticator',
    },
    secret: 'JBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/Voucha:tests+totp-setup-flow@voucha.ai?secret=JBSWY3DPEHPK3PXP',
  }
}

function makeSetupFlowProps(
  overrides: Partial<React.ComponentProps<typeof TotpSetupFlow>> = {},
): React.ComponentProps<typeof TotpSetupFlow> {
  return {
    loading: false,
    setupCode: '',
    setupData: null,
    setupName: '',
    onStartSetup: vi.fn<(e: React.FormEvent) => void>(),
    onVerifySetup: vi.fn<(code: string) => void>(),
    setSetupCode: vi.fn<(code: string) => void>(),
    setSetupData: vi.fn<(data: TotpSetupData | null) => void>(),
    setSetupName: vi.fn<(name: string) => void>(),
    setStep: vi.fn<(step: 'list' | 'setup') => void>(),
    ...overrides,
  }
}

function renderSetupFlow(overrides: Partial<React.ComponentProps<typeof TotpSetupFlow>> = {}) {
  const props = makeSetupFlowProps(overrides)

  return render(<TotpSetupFlow {...props} />)
}

describe('TOTP setup flow', () => {
  it('labels the optional authenticator name input with the visible label', () => {
    renderSetupFlow()

    expect(
      screen.getByRole('textbox', {
        name: 'Authenticator name (optional)',
      }),
    ).toBeDefined()
  })

  it('labels the setup code input with the visible instruction', () => {
    renderSetupFlow({ setupData: makeSetupData() })

    expect(
      screen.getByRole('textbox', {
        name: 'Enter the 6-digit code from your authenticator app to confirm',
      }),
    ).toBeDefined()
  })

  it('uses unique control ids when repeated setup flows render', () => {
    render(
      <>
        <TotpSetupFlow {...makeSetupFlowProps()} />
        <TotpSetupFlow {...makeSetupFlowProps()} />
        <TotpSetupFlow {...makeSetupFlowProps({ setupData: makeSetupData() })} />
        <TotpSetupFlow {...makeSetupFlowProps({ setupData: makeSetupData() })} />
      </>,
    )

    const ids = [
      ...screen.getAllByRole('textbox', {
        name: 'Authenticator name (optional)',
      }),
      ...screen.getAllByRole('textbox', {
        name: 'Enter the 6-digit code from your authenticator app to confirm',
      }),
    ].map(input => input.id)

    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
