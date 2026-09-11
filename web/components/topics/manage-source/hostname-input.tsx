import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export function HostnameInput({
  dataPw,
  id,
  keyValue,
  label,
  name,
  placeholder,
  value,
}: {
  dataPw?: string
  id: string
  keyValue?: string
  label: string
  name: string
  placeholder: string
  value?: string
}) {
  return (
    <div className='flex-1'>
      <Label
        htmlFor={id}
        className='sr-only'
      >
        {label}
      </Label>
      <Input
        key={keyValue}
        type='text'
        id={id}
        name={name}
        {...(dataPw && { 'data-pw': dataPw })}
        defaultValue={value}
        placeholder={placeholder}
      />
    </div>
  )
}
