import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Components/Card',
  component: Card,
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <Card className='mx-auto max-w-md'>
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Supporting description for a simple card.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>Reusable card content lives here.</p>
        </CardContent>
        <CardFooter>
          <Button size='sm'>Continue</Button>
        </CardFooter>
      </Card>
    </main>
  ),
}
