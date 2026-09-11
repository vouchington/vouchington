import { Input } from '@/components/ui/input'

export function HoneypotFields({
  hpPhoneRef,
  hpWebsiteRef,
}: {
  hpPhoneRef: React.RefObject<HTMLInputElement | null>
  hpWebsiteRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div
      aria-hidden='true'
      style={{
        position: 'absolute',
        left: '-9999px',
        opacity: 0,
        visibility: 'hidden',
      }}
    >
      <Input
        ref={hpWebsiteRef}
        name='hp_website'
        type='text'
        tabIndex={-1}
        autoComplete='off'
        defaultValue=''
      />
      <Input
        ref={hpPhoneRef}
        name='hp_phone'
        type='text'
        tabIndex={-1}
        autoComplete='off'
        defaultValue=''
      />
    </div>
  )
}
