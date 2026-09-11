import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import {
  DataPointFields,
  type DataPointVertical,
  type StructuredDataState,
} from '../data-point-fields'
import type { FinancialProfile } from '@/types/my'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ onValueChange, value, children }: any) => (
        <select
          value={value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value)}
          data-testid='vertical-select'
        >
          {children}
        </select>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
      // Return children directly — <div> inside <select> is invalid HTML and causes jsdom
      // to strip options, breaking the controlled-component update cycle.
      SelectContent: ({ children }: any) => children,
      SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('../credit-card-fields'), () => ({
  CreditCardFields: ({ onUpdate }: any) => (
    <div data-testid='credit-card-fields'>
      <button
        type='button'
        data-testid='cc-update-btn'
        onClick={() => {
          onUpdate('topic_ids', ['t1'])
          onUpdate('topic_name', 'Chase Sapphire')
        }}
      >
        update
      </button>
    </div>
  ),
}))

vi.mock(import('../bank-account-fields'), () => ({
  BankAccountFields: () => <div data-testid='bank-account-fields' />,
}))

vi.mock(import('../data-point-profile-fields'), () => ({
  DataPointProfileFields: ({
    saveToProfile,
    onSaveToProfileChange,
    userFinancialProfile,
    vertical,
  }: any) => (
    <div data-testid='profile-fields'>
      <span data-testid='profile-vertical'>{vertical}</span>
      <span data-testid='profile-has-profile'>{userFinancialProfile ? 'yes' : 'no'}</span>
      <input
        type='checkbox'
        data-testid='save-to-profile-checkbox'
        aria-label='Save to profile'
        checked={saveToProfile}
        onChange={e => onSaveToProfileChange(e.target.checked)}
        readOnly
      />
    </div>
  ),
}))

const profileWithData: FinancialProfile = {
  user_id: 'user-1',
  currency: 'usd',
  credit_score_range: '700-749',
  stated_income_range: {
    minimum: { amount: 5_000_000, currency: 'usd' },
    maximum: { amount: 7_500_000, currency: 'usd' },
  },
  total_credit_limit: { amount: 1_000_000, currency: 'usd' },
  years_of_credit_history: 5,
  hard_inquiries_12m: 2,
  cards_opened_24m: 3,
  updated_at: '2024-01-15T10:00:00Z',
}

const profileWithAllNullFields: FinancialProfile = {
  user_id: 'user-1',
  currency: 'usd',
  credit_score_range: null,
  stated_income_range: null,
  total_credit_limit: null,
  years_of_credit_history: null,
  hard_inquiries_12m: null,
  cards_opened_24m: null,
  updated_at: '2024-01-15T10:00:00Z',
}

const EMPTY_STRUCTURED_DATA: StructuredDataState = {}

function Wrapper({
  userFinancialProfile,
  initialStructuredData = EMPTY_STRUCTURED_DATA,
}: {
  userFinancialProfile?: FinancialProfile | null
  initialStructuredData?: StructuredDataState
}) {
  const [vertical, setVertical] = useState<DataPointVertical | null>(null)
  const [structuredData, setStructuredData] = useState<StructuredDataState>(initialStructuredData)
  const [saveToProfile, setSaveToProfile] = useState(false)
  return (
    <>
      <span data-testid='structured-data-keys'>
        {Object.keys(structuredData).toSorted().join(',')}
      </span>
      <DataPointFields
        vertical={vertical}
        onVerticalChange={setVertical}
        structuredData={structuredData}
        onStructuredDataChange={setStructuredData}
        userFinancialProfile={userFinancialProfile}
        saveToProfile={saveToProfile}
        onSaveToProfileChange={setSaveToProfile}
      />
    </>
  )
}

function getVerticalSelect(): HTMLElement {
  const select = screen
    .getAllByTestId('vertical-select')
    .find(candidate => candidate.querySelector('option[value="credit_card"]'))
  expect(select).toBeDefined()
  return select!
}

describe('DataPointFields', () => {
  it('does not show profile section before vertical is selected', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    expect(screen.queryByTestId('profile-fields')).toBeNull()
  })

  it('shows profile section after selecting credit_card vertical', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.getByTestId('profile-fields')).toBeDefined()
    expect(screen.getByTestId('profile-vertical').textContent).toBe('credit_card')
  })

  it('shows profile section after selecting bank_account vertical', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'bank_account' } })
    expect(screen.getByTestId('profile-fields')).toBeDefined()
    expect(screen.getByTestId('profile-vertical').textContent).toBe('bank_account')
  })

  it('passes userFinancialProfile to profile fields', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.getByTestId('profile-has-profile').textContent).toBe('yes')
  })

  it('passes null userFinancialProfile when not provided', () => {
    render(<Wrapper />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.getByTestId('profile-has-profile').textContent).toBe('no')
  })

  it('save-to-profile checkbox is unchecked by default', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    const checkbox = screen.getByTestId('save-to-profile-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('save-to-profile toggle updates parent state', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    const checkbox = screen.getByTestId('save-to-profile-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('renders credit-card-fields when credit_card vertical is selected', () => {
    render(<Wrapper />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.getByTestId('credit-card-fields')).toBeDefined()
    expect(screen.queryByTestId('bank-account-fields')).toBeNull()
  })

  it('renders bank-account-fields when bank_account vertical is selected', () => {
    render(<Wrapper />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'bank_account' } })
    expect(screen.getByTestId('bank-account-fields')).toBeDefined()
    expect(screen.queryByTestId('credit-card-fields')).toBeNull()
  })

  it('does not show privacy banner (removed in favour of profile section)', () => {
    render(<Wrapper userFinancialProfile={profileWithData} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.queryByText(/Fields pre-filled from your financial profile/)).toBeNull()
  })

  it('profile section visible for null-field profile too', () => {
    render(<Wrapper userFinancialProfile={profileWithAllNullFields} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    expect(screen.getByTestId('profile-fields')).toBeDefined()
  })

  it('clears credit-card-only keys when switching to bank_account', () => {
    // Pre-seed structuredData with credit-card-only keys
    render(
      <Wrapper
        initialStructuredData={{
          hard_inquiries_12m: 3,
          cards_opened_24m: 2,
          credit_limit: 500_000,
          total_credit_limit_all_cards: 2_000_000,
          years_of_credit_history: 5,
          is_business_application: false,
          application_method: 'online',
        }}
      />,
    )
    // First select credit_card so the component is initialised, then switch to bank_account
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    fireEvent.change(getVerticalSelect(), { target: { value: 'bank_account' } })

    const keys = screen.getByTestId('structured-data-keys').textContent ?? ''
    expect(keys).not.toContain('hard_inquiries_12m')
    expect(keys).not.toContain('cards_opened_24m')
    expect(keys).not.toContain('credit_limit')
    expect(keys).not.toContain('total_credit_limit_all_cards')
    expect(keys).not.toContain('years_of_credit_history')
    expect(keys).not.toContain('is_business_application')
    expect(keys).not.toContain('application_method')
  })

  it('clears bank-account-only keys when switching to credit_card', () => {
    // Pre-seed structuredData with bank-account-only keys
    render(
      <Wrapper
        initialStructuredData={{
          account_type: 'checking',
          bonus_amount: 20_000,
          bonus_requirements: 'spend $500',
          minimum_balance_requirement: 50_000,
          direct_deposit_setup: true,
        }}
      />,
    )
    // First select bank_account so the component is initialised, then switch to credit_card
    fireEvent.change(getVerticalSelect(), { target: { value: 'bank_account' } })
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })

    const keys = screen.getByTestId('structured-data-keys').textContent ?? ''
    expect(keys).not.toContain('account_type')
    expect(keys).not.toContain('bonus_amount')
    expect(keys).not.toContain('bonus_requirements')
    expect(keys).not.toContain('minimum_balance_requirement')
    expect(keys).not.toContain('direct_deposit_setup')
  })

  it('child onUpdate composes correctly via functional updater (covers consecutive key updates)', () => {
    render(<Wrapper initialStructuredData={{ existing: 'value' }} />)
    fireEvent.change(getVerticalSelect(), { target: { value: 'credit_card' } })
    // Click fires two onUpdate calls in the same handler — exercises the stale-closure
    // regression where non-functional setState would discard the first update.
    fireEvent.click(screen.getByTestId('cc-update-btn'))
    const keys = screen.getByTestId('structured-data-keys').textContent ?? ''
    expect(keys).toContain('existing')
    expect(keys).toContain('topic_ids')
    expect(keys).toContain('topic_name')
  })
})
