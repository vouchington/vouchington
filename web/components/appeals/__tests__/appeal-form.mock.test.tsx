import type { AriaAttributes, ReactElement, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createModerationAppeal } from '@/lib/api/client/appeals'
import onError, { onSuccess } from '@/lib/on-error'
import { AppealForm } from '../appeal-form'
const mockRefresh = vi.fn<VitestLooseMock>()
const mockTurnstileReset = vi.fn<VitestLooseMock>()
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/hooks/use-turnstile-token'),
  () =>
    ({
      useTurnstileToken: () => ({ token: 'test-turnstile-token', reset: mockTurnstileReset }),
    }) as unknown as typeof import('@/hooks/use-turnstile-token'),
)
vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => <div data-testid='turnstile-field' />,
}))
// Radix Select does not work in JSDOM; replace with a plain native select.
vi.mock(import('@/components/ui/select'), () => {
  interface SelectTriggerProps {
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: AriaAttributes['aria-invalid']
  }
  function SelectTrigger(_props: SelectTriggerProps) {
    return null
  }
  function isSelectTriggerElement(child: ReactNode): child is ReactElement<SelectTriggerProps> {
    return (
      typeof child === 'object' && child !== null && 'type' in child && child.type === SelectTrigger
    )
  }
  return {
    Select: ({
      children,
      value,
      onValueChange,
      disabled,
    }: {
      children: ReactNode
      value: string
      onValueChange: (v: string) => void
      disabled?: boolean
    }) => {
      const childArray = Array.isArray(children) ? children : [children]
      const trigger = childArray.find(isSelectTriggerElement)

      return (
        <select
          id={trigger?.props.id}
          aria-invalid={trigger?.props['aria-invalid']}
          aria-describedby={trigger?.props['aria-describedby']}
          value={value}
          disabled={disabled}
          onChange={e => onValueChange(e.target.value)}
        >
          {children}
        </select>
      )
    },
    SelectTrigger,
    SelectValue: ({ placeholder }: { placeholder: string }) => (
      <option value=''>{placeholder}</option>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => children,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
      <option value={value}>{children}</option>
    ),
  } as unknown as typeof import('@/components/ui/select')
})

vi.mock(import('@/lib/api/client/appeals'), () => ({
  createModerationAppeal: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const mockCreateModerationAppeal = vi.mocked(createModerationAppeal)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)
const getReasonSelect = () => screen.getByRole('combobox', { name: 'Reason' })
const getStatementTextbox = () => screen.getByRole('textbox', { name: 'Statement' })
type AppealFormTestProps = Parameters<typeof AppealForm>[0]

function renderForm(props: Partial<AppealFormTestProps> = {}) {
  render(
    <AppealForm
      targetType='warning'
      targetId='warn-1'
      {...props}
    />,
  )
}

function submitForm() {
  fireEvent.submit(document.querySelector('[data-pw="appeal-form"]')!)
}

function changeReason(value: string) {
  fireEvent.change(getReasonSelect(), { target: { value } })
}

function changeStatement(value: string) {
  fireEvent.change(getStatementTextbox(), { target: { value } })
}

describe('AppealForm', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
    mockTurnstileReset.mockReset()
    mockCreateModerationAppeal.mockReset()
    mockOnError.mockReset()
    mockOnSuccess.mockReset()
    mockCreateModerationAppeal.mockResolvedValue({
      appeal: { id: 'appeal-1' },
      isDuplicate: false,
    } as never)
  })

  it('renders form with correct data-pw attributes', () => {
    renderForm()
    expect(document.querySelector('[data-pw="appeal-form"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="appeal-submit-button"]')).not.toBeNull()
    expect(screen.getByTestId('turnstile-field')).toBeDefined()
  })

  it('submit button is enabled when turnstile token is present', () => {
    renderForm()
    const btn = document.querySelector('[data-pw="appeal-submit-button"]') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('shows validation error when no reason selected', async () => {
    renderForm()
    changeStatement('My statement here.')

    submitForm()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please select a reason')
    })
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'appeal-form-validation-error')
    expect(getReasonSelect()).toHaveAttribute('aria-invalid', 'true')
    expect(getReasonSelect()).toHaveAttribute('aria-describedby', 'appeal-form-validation-error')
    const select = getReasonSelect()
    fireEvent.change(select, { target: { value: 'wrong_rule' } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
    expect(select).not.toHaveAttribute('aria-invalid')
    expect(select).not.toHaveAttribute('aria-describedby')
    expect(mockCreateModerationAppeal).not.toHaveBeenCalled()
  })

  it('shows validation error when statement is empty', async () => {
    renderForm()
    changeReason('incorrect_facts')

    submitForm()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please provide a statement')
    })
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'appeal-form-validation-error')
    expect(getStatementTextbox()).toHaveAttribute('aria-invalid', 'true')
    expect(getStatementTextbox()).toHaveAttribute(
      'aria-describedby',
      'appeal-form-validation-error',
    )
    const textarea = getStatementTextbox()
    fireEvent.change(textarea, { target: { value: 'Updated statement.' } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
    expect(textarea).not.toHaveAttribute('aria-invalid')
    expect(textarea).not.toHaveAttribute('aria-describedby')
    expect(mockCreateModerationAppeal).not.toHaveBeenCalled()
  })

  it('shows validation error when statement exceeds 3800 chars', async () => {
    renderForm()
    changeReason('other')
    changeStatement('x'.repeat(3801))
    submitForm()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('3,800 characters')
    })
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'appeal-form-validation-error')
    expect(getStatementTextbox()).toHaveAttribute('aria-invalid', 'true')
    expect(getStatementTextbox()).toHaveAttribute(
      'aria-describedby',
      'appeal-form-validation-error',
    )
    expect(mockCreateModerationAppeal).not.toHaveBeenCalled()
  })

  it('calls createModerationAppeal with correct args on valid submit', async () => {
    renderForm({
      targetType: 'removal',
      targetId: 'post-42',
      postRemovalKind: 'community',
    })
    changeReason('incorrect_facts')

    changeStatement('The facts are wrong.')

    submitForm()

    await waitFor(() => {
      expect(mockCreateModerationAppeal).toHaveBeenCalledWith({
        target_type: 'removal',
        target_id: 'post-42',
        post_removal_kind: 'community',
        appeal_reason: '[The facts cited are incorrect] The facts are wrong.',
        cf_turnstile_response: 'test-turnstile-token',
      })
    })
    expect(mockOnSuccess).toHaveBeenCalledWith(
      'Appeal submitted. You will be notified when it is reviewed.',
    )
  })

  it('calls onSuccess prop and shows duplicate message when isDuplicate is true', async () => {
    mockCreateModerationAppeal.mockResolvedValue({
      appeal: { id: 'appeal-2' },
      isDuplicate: true,
    } as never)
    const onSuccessProp = vi.fn<VitestLooseMock>()

    renderForm({
      targetType: 'ban',
      targetId: 'ban-7',
      onSuccess: onSuccessProp,
    })
    changeReason('disproportionate')

    changeStatement('I disagree.')

    submitForm()

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(
        'You already have a pending appeal for this item — your appeal is under review.',
      )
      expect(onSuccessProp).toHaveBeenCalled()
    })
  })

  it('calls onSuccess prop after successful (non-duplicate) submit', async () => {
    const onSuccessProp = vi.fn<VitestLooseMock>()
    renderForm({
      targetType: 'removal',
      targetId: 'post-9',
      onSuccess: onSuccessProp,
    })
    changeReason('context_missing')

    changeStatement('Context was missing from the report.')

    submitForm()

    await waitFor(() => {
      expect(onSuccessProp).toHaveBeenCalled()
    })
  })

  it('calls turnstile.reset() and onError on API failure', async () => {
    mockCreateModerationAppeal.mockRejectedValue(new Error('network error'))
    renderForm()
    changeReason('wrong_rule')

    changeStatement('The rule does not apply.')

    submitForm()

    await waitFor(() => {
      expect(mockTurnstileReset).toHaveBeenCalled()
      expect(mockOnError).toHaveBeenCalledWith(new Error('network error'), {
        fallback: 'Failed to submit appeal',
        tags: { form: 'appeal-form' },
      })
    })
  })
})
