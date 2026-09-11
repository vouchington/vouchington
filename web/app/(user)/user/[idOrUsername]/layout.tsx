import { UserRouteLayout } from '@/components/users/user-route-layout'

interface LayoutProps {
  params: Promise<{ idOrUsername: string }>
  children: React.ReactNode
}

export const dynamic = 'force-dynamic'

export default async function UserDetailLayout({ params, children }: LayoutProps) {
  const { idOrUsername } = await params

  return <UserRouteLayout idOrUsername={idOrUsername}>{children}</UserRouteLayout>
}
