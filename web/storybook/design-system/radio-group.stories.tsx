import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const meta = {
  title: 'Design System/Components/RadioGroup',
  component: RadioGroup,
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

const OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'spacious', label: 'Spacious' },
] as const

export const Default: Story = {
  render: () => (
    <Frame>
      <RadioGroup
        defaultValue='comfortable'
        aria-label='Density'
      >
        {OPTIONS.map(option => (
          <Label
            key={option.value}
            htmlFor={`density-${option.value}`}
            className='flex cursor-pointer items-center gap-2 text-sm font-normal'
          >
            <RadioGroupItem
              id={`density-${option.value}`}
              value={option.value}
            />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const comfortable = canvas.getByRole('radio', { name: 'Comfortable' })
    const compact = canvas.getByRole('radio', { name: 'Compact' })

    await expect(comfortable).toBeChecked()
    await expect(compact).not.toBeChecked()

    await userEvent.click(compact)
    await expect(compact).toBeChecked()
    await expect(comfortable).not.toBeChecked()
  },
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <RadioGroup
        defaultValue='comfortable'
        aria-label='Density'
        disabled
      >
        {OPTIONS.map(option => (
          <Label
            key={option.value}
            htmlFor={`density-disabled-${option.value}`}
            className='flex items-center gap-2 text-sm font-normal'
          >
            <RadioGroupItem
              id={`density-disabled-${option.value}`}
              value={option.value}
            />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </Frame>
  ),
}
