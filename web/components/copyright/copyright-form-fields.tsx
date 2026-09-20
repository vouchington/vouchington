import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function DeclarationCheckbox({
  id,
  children,
  ...checkbox
}: React.ComponentProps<typeof Checkbox> & { id: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start gap-2'>
      <Checkbox
        id={id}
        {...checkbox}
      />
      <Label htmlFor={id}>{children}</Label>
    </div>
  )
}

export function LabeledInput(props: React.ComponentProps<typeof Input> & { label: string }) {
  const { label, id, ...input } = props
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        {...input}
      />
    </div>
  )
}

export function LabeledTextarea(props: React.ComponentProps<typeof Textarea> & { label: string }) {
  const { label, id, ...input } = props
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        {...input}
      />
    </div>
  )
}
