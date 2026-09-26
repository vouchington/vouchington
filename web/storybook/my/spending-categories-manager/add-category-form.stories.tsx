import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddCategoryForm } from '@/components/my/spending-categories-manager/add-category-form'
import type { SpendingFrequency } from '@/components/my/spending-categories-manager/frequency-select'
import { StoryFrame } from '@/storybook/story-frame'
import type { CurrencyCode } from '@ts-shared/money'

const meta = {
  title: 'My/Add Category Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function CategoryDraft({
  categoryId,
  label,
  amount,
  note,
}: {
  categoryId: string | null
  label: string
  amount: string
  note: string
}) {
  const [id, setId] = useState(categoryId)
  const [categoryLabel, setCategoryLabel] = useState(label)
  const [spendAmount, setSpendAmount] = useState(amount)
  const [currency, setCurrency] = useState<CurrencyCode>('usd')
  const [frequency, setFrequency] = useState<SpendingFrequency>('monthly')
  const [categoryNote, setCategoryNote] = useState(note)
  return (
    <AddCategoryForm
      loading={false}
      newAmount={spendAmount}
      newCurrency={currency}
      newCategoryId={id}
      newCategoryLabel={categoryLabel}
      newFrequency={frequency}
      newNote={categoryNote}
      onAdd={() => {}}
      setNewAmount={setSpendAmount}
      setNewCurrency={setCurrency}
      setNewCategoryId={setId}
      setNewCategoryLabel={setCategoryLabel}
      setNewFrequency={setFrequency}
      setNewNote={setCategoryNote}
    />
  )
}

export const Groceries: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CategoryDraft
        categoryId='topic-groceries'
        label='Groceries'
        amount='600.00'
        note='Weekly supermarket runs.'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CategoryDraft
        categoryId={null}
        label=''
        amount=''
        note=''
      />
    </StoryFrame>
  ),
}
