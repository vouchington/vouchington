import { UserRouteLayout } from '@/components/users/user-route-layout'
import { headers } from 'next/headers'
import { isUUID } from '@ts-shared/utils/validation-core'

interface LayoutProps {
  params: Promise<{ idOrUsername: string }>
  children: React.ReactNode
}

export const dynamic = 'force-dynamic'

export default async function UserDetailLayout({ params, children }: LayoutProps) {
  const { idOrUsername } = await params
  const pathname = (await headers()).get('x-pathname')
  const allowMissingProfile = isUUID(idOrUsername) && pathname === `/user/${idOrUsername}/admin`

  return (
    <UserRouteLayout
      idOrUsername={idOrUsername}
      allowMissingProfile={allowMissingProfile}
    >
      {children}
    </UserRouteLayout>
  )
}
