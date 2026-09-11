import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ValidationRulesTable } from '../validation-rules-table'
import { deleteReferralLinkValidationRule } from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('@/lib/api/client/referral-link-validations'), () => ({
  deleteReferralLinkValidationRule: vi.fn<VitestLooseMock>(),
  createReferralLinkValidationRule: vi.fn<VitestLooseMock>(),
  updateReferralLinkValidationRule: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

// ValidationRuleForm is rendered inside ValidationRulesTable; stub it out
vi.mock(import('../validation-rule-form'), () => ({
  ValidationRuleForm: ({ onCancel }: { onCancel?: () => void }) => (
    <div data-testid='mock-validation-rule-form'>
      <button
        type='button'
        onClick={onCancel}
      >
        Cancel Form
      </button>
    </div>
  ),
}))

// AdminTableShell passes through children
vi.mock(
  import('@/components/admin/admin-table-shell'),
  () =>
    ({
      AdminTableShell: ({
        children,
        isEmpty,
        emptyMessage,
      }: {
        children: React.ReactNode
        isEmpty: boolean
        emptyMessage: string
      }) => (isEmpty ? <p>{emptyMessage}</p> : <div>{children}</div>),
    }) as unknown as typeof import('@/components/admin/admin-table-shell'),
)

const mockDelete = vi.mocked(deleteReferralLinkValidationRule)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const rule = {
  id: 'rule-1',
  referral_program_link_validation_id: 'val-1',
  hostname: 'chase.com',
  pathname: '/ref/%',
  is_referral_link_url: true,
  is_invalid_referral_link_url: false,
  user_error_text: null,
  example_urls: ['https://chase.com/ref/you'],
}

describe('ValidationRulesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no rules', () => {
    render(
      <ValidationRulesTable
        validationId='val-1'
        initialRules={[]}
      />,
    )
    expect(screen.getByText('No rules yet. Add one above.')).toBeInTheDocument()
  })

  it('renders rules table with rule data', () => {
    render(
      <ValidationRulesTable
        validationId='val-1'
        initialRules={[rule]}
      />,
    )
    expect(screen.getByText('chase.com')).toBeInTheDocument()
    expect(screen.getByText('/ref/%')).toBeInTheDocument()
  })

  it('calls deleteReferralLinkValidationRule after confirming delete dialog', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    const { container } = render(
      <ValidationRulesTable
        validationId='val-1'
        initialRules={[rule]}
      />,
    )

    // Click the delete trigger to open the confirmation dialog
    fireEvent.click(container.querySelector(`[data-pw="rule-delete-${rule.id}"]`)!)

    expect(
      await screen.findByText('This permanently removes the selected validation rule.'),
    ).toBeInTheDocument()

    // Confirm via the dialog action button (AlertDialogAction with "Delete" text)
    const allDeleteBtns = await screen.findAllByRole('button', { name: /^delete$/i })
    fireEvent.click(allDeleteBtns.at(-1)!)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('val-1', 'rule-1')
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Rule deleted')
  })

  it('describes the delete confirmation dialog for assistive technology', async () => {
    const { container } = render(
      <ValidationRulesTable
        validationId='val-1'
        initialRules={[rule]}
      />,
    )

    fireEvent.click(container.querySelector(`[data-pw="rule-delete-${rule.id}"]`)!)

    expect(
      await screen.findByText('This permanently removes the selected validation rule.'),
    ).toBeInTheDocument()
  })

  it('calls onError when delete fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    const { container } = render(
      <ValidationRulesTable
        validationId='val-1'
        initialRules={[rule]}
      />,
    )

    fireEvent.click(container.querySelector(`[data-pw="rule-delete-${rule.id}"]`)!)
    const allDeleteBtns = await screen.findAllByRole('button', { name: /^delete$/i })
    fireEvent.click(allDeleteBtns.at(-1)!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to delete rule' }),
      )
    })
  })
})
