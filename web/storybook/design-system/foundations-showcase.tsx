import type { ReactNode } from 'react'

const colorTokens = [
  { name: '--background', label: 'Background' },
  { name: '--foreground', label: 'Foreground' },
  { name: '--card', label: 'Card' },
  { name: '--popover', label: 'Popover' },
  { name: '--primary', label: 'Primary' },
  { name: '--primary-foreground', label: 'Primary FG' },
  { name: '--secondary', label: 'Secondary' },
  { name: '--muted', label: 'Muted' },
  { name: '--muted-foreground', label: 'Muted FG' },
  { name: '--accent', label: 'Accent' },
  { name: '--destructive', label: 'Destructive' },
  { name: '--border', label: 'Border' },
  { name: '--ring', label: 'Ring' },
]

const typographyScales = [
  { name: 'Page title', className: 'text-2xl font-bold tracking-tight', sample: 'Trust Network' },
  {
    name: 'Section title',
    className: 'text-lg font-semibold tracking-tight',
    sample: 'Product Categories',
  },
  { name: 'Card title', className: 'text-base font-semibold', sample: 'Verified Endorsements' },
  { name: 'Body', className: 'text-sm', sample: 'Real data from real people, verified by trust.' },
  {
    name: 'Caption',
    className: 'text-xs text-muted-foreground',
    sample: '3 hours ago - 42 comments',
  },
  {
    name: 'Label',
    className: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
    sample: 'Section Label',
  },
  { name: 'Mono', className: 'font-mono text-xs', sample: 'Cmd+K - 0x1a2b3c' },
]

const spacingValues = [
  { name: 'gap-1', value: '4px', className: 'w-1' },
  { name: 'gap-2', value: '8px', className: 'w-2' },
  { name: 'gap-3', value: '12px', className: 'w-3' },
  { name: 'gap-4', value: '16px', className: 'w-4' },
  { name: 'gap-6', value: '24px', className: 'w-6' },
]

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
      {children}
    </h2>
  )
}

export function FoundationsShowcase() {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-5xl flex-col gap-8'>
        <section className='flex flex-col gap-3'>
          <SectionLabel>Colors</SectionLabel>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
            {colorTokens.map(token => (
              <div
                key={token.name}
                className='flex flex-col gap-1'
              >
                <div
                  className='h-12 w-full rounded-md border'
                  style={{ backgroundColor: `hsl(var(${token.name}))` }}
                />
                <span className='font-mono text-xs'>{token.name}</span>
                <span className='text-xs text-muted-foreground'>{token.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className='flex flex-col gap-3'>
          <SectionLabel>Typography</SectionLabel>
          <div className='flex flex-col gap-3 rounded-md border p-3'>
            {typographyScales.map(scale => (
              <div
                key={scale.name}
                className='flex items-baseline gap-3 border-b pb-3 last:border-b-0 last:pb-0'
              >
                <span className='w-24 shrink-0 font-mono text-xs text-muted-foreground'>
                  {scale.name}
                </span>
                <span className={scale.className}>{scale.sample}</span>
              </div>
            ))}
          </div>
        </section>

        <section className='flex flex-col gap-3'>
          <SectionLabel>Spacing</SectionLabel>
          <div className='flex flex-col gap-2 rounded-md border p-3'>
            {spacingValues.map(space => (
              <div
                key={space.name}
                className='flex items-center gap-3'
              >
                <span className='w-16 shrink-0 font-mono text-xs text-muted-foreground'>
                  {space.name}
                </span>
                <div className={`${space.className} h-4 rounded-sm bg-primary`} />
                <span className='text-xs text-muted-foreground'>{space.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
