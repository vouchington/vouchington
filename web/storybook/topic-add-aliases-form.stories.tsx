import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { AddAliasesForm } from '@/components/topics/aliases/add-aliases-form'

const meta = {
  title: 'Topics/Add Aliases Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function AddAliasesFormStory({ adding = false }: { adding?: boolean }) {
  return (
    <AddAliasesForm
      onSubmit={e => e.preventDefault()}
      adding={adding}
      mounted
    />
  )
}

export const Default: Story = {
  render: () => <AddAliasesFormStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /add aliases/i })).toBeEnabled()
  },
}

export const Adding: Story = {
  render: () => <AddAliasesFormStory adding />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /adding/i })).toBeDisabled()
  },
}
