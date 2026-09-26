import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddValuationForm } from '@/components/my/point-valuations-manager/add-valuation-form'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { CurrencyCode } from '@ts-shared/money'

const meta = {
  title: 'My/Add Valuation Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ultimateRewards = topics[3]!

function ValuationDraft({
  programId,
  programLabel,
  value,
  note,
}: {
  programId: string | null
  programLabel: string
  value: string
  note: string
}) {
  const [id, setId] = useState(programId)
  const [label, setLabel] = useState(programLabel)
  const [valuePerPoint, setValuePerPoint] = useState(value)
  const [currency, setCurrency] = useState<CurrencyCode>('usd')
  const [valuationNote, setValuationNote] = useState(note)
  return (
    <AddValuationForm
      loading={false}
      newValuePerPoint={valuePerPoint}
      newCurrency={currency}
      newNote={valuationNote}
      newProgramId={id}
      newProgramLabel={label}
      onAdd={() => {}}
      setNewValuePerPoint={setValuePerPoint}
      setNewCurrency={setCurrency}
      setNewNote={setValuationNote}
      setNewProgramId={setId}
      setNewProgramLabel={setLabel}
    />
  )
}

export const UltimateRewards: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ValuationDraft
        programId={ultimateRewards.id}
        programLabel={ultimateRewards.name}
        value='0.015'
        note='What I use for international business class.'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ValuationDraft
        programId={null}
        programLabel=''
        value=''
        note=''
      />
    </StoryFrame>
  ),
}
