import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Checkbox } from '@/components/ui/checkbox'
import { CheckboxCard } from '@/components/ui/checkbox-card'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'Design System/Components/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

function CheckboxCardDemo() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [marketingEmails, setMarketingEmails] = useState(false)
  const [disabledOption, setDisabledOption] = useState(false)

  return (
    <Frame>
      <CheckboxCard
        id='checkbox-card-notifications'
        checked={emailNotifications}
        onCheckedChange={setEmailNotifications}
        label='Email notifications'
        description='Receive a digest when someone replies to your posts.'
        data-pw='checkbox-card-notifications'
      />
      <CheckboxCard
        id='checkbox-card-marketing'
        checked={marketingEmails}
        onCheckedChange={setMarketingEmails}
        label='Marketing emails'
        description='Occasional product updates and announcements.'
        data-pw='checkbox-card-marketing'
      />
      <CheckboxCard
        id='checkbox-card-disabled'
        checked={disabledOption}
        onCheckedChange={setDisabledOption}
        label='Disabled option'
        description='Available on the paid plan.'
        disabled
        data-pw='checkbox-card-disabled'
      />
    </Frame>
  )
}

function getStoryElement(canvasElement: HTMLElement, dataPw: string): HTMLElement {
  const element = canvasElement.querySelector<HTMLElement>(`[data-pw="${dataPw}"]`)
  if (element == null) {
    throw new Error(`Missing story element with data-pw="${dataPw}"`)
  }
  return element
}

export const Default: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-2'>
        <Checkbox
          id='checkbox-unchecked'
          defaultChecked={false}
        />
        <Label htmlFor='checkbox-unchecked'>Unchecked option</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox
          id='checkbox-checked'
          defaultChecked
        />
        <Label htmlFor='checkbox-checked'>Checked option</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox
          id='checkbox-disabled'
          disabled
        />
        <Label htmlFor='checkbox-disabled'>Disabled option</Label>
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const uncheckedOption = canvas.getByRole('checkbox', { name: 'Unchecked option' })
    const checkedOption = canvas.getByRole('checkbox', { name: 'Checked option' })
    const disabledOption = canvas.getByRole('checkbox', { name: 'Disabled option' })

    await expect(uncheckedOption).not.toBeChecked()
    await expect(checkedOption).toBeChecked()
    await expect(disabledOption).toBeDisabled()

    await userEvent.click(uncheckedOption)
    await expect(uncheckedOption).toBeChecked()

    await userEvent.click(checkedOption)
    await expect(checkedOption).not.toBeChecked()

    await userEvent.click(disabledOption)
    await expect(disabledOption).not.toBeChecked()
  },
}

export const Card: Story = {
  render: () => <CheckboxCardDemo />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const emailNotifications = canvas.getByRole('checkbox', { name: 'Email notifications' })
    const marketingEmails = canvas.getByRole('checkbox', { name: 'Marketing emails' })
    const disabledOption = canvas.getByRole('checkbox', { name: 'Disabled option' })

    await expect(emailNotifications).toBeChecked()
    await expect(marketingEmails).not.toBeChecked()
    await expect(disabledOption).toBeDisabled()

    await userEvent.click(getStoryElement(canvasElement, 'checkbox-card-marketing'))
    await expect(marketingEmails).toBeChecked()

    await userEvent.click(canvas.getByText('Receive a digest when someone replies to your posts.'))
    await expect(emailNotifications).not.toBeChecked()

    await userEvent.click(getStoryElement(canvasElement, 'checkbox-card-disabled'))
    await expect(disabledOption).not.toBeChecked()
  },
}
