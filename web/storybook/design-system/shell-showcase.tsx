import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageWithAside } from '@/components/page-with-aside'
import { AsideProvider } from '@/lib/aside-provider'

function ShellTestAside() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shell Test Aside</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-sm text-muted-foreground'>
          This aside panel is injected by the shell test story to verify that the aside slot renders
          correctly alongside the sidebar, navbar, and main content area.
        </p>
      </CardContent>
    </Card>
  )
}

export function ShellShowcase() {
  return (
    <main className='min-h-screen bg-background py-6 text-foreground'>
      <AsideProvider>
        <PageWithAside
          aside={ShellTestAside}
          showFooter={false}
        >
          <div className='flex flex-col gap-6'>
            <div className='flex flex-col gap-2'>
              <h2 className='text-lg font-semibold'>What this story validates</h2>
              <ul className='list-disc pl-5 text-sm text-muted-foreground'>
                <li>Sidebar-adjacent page content remains constrained to the shared container</li>
                <li>Aside slot renders the injected card on desktop viewports</li>
                <li>Main content area does not overflow horizontally</li>
              </ul>
            </div>
          </div>
        </PageWithAside>
      </AsideProvider>
    </main>
  )
}
