'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IssueWarningDialog } from '@/components/shared/issue-warning-dialog'
import { UserAdminWarnings } from './user-admin-warnings'
import { useTranslations } from '@/lib/i18n/use-translations'

export function UserAdminWarningsCard({ userId }: { userId: string }) {
  const t = useTranslations()
  const [warningsKey, setWarningsKey] = useState(0)

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle data-pw='user-admin-warnings-title'>
              {t('extracted.admin.userAdminPanel.warnings_0e04cd10')}
            </CardTitle>
            <CardDescription>
              {t('extracted.admin.userAdminPanel.warningsIssuedToThisUser_7a8b01fc')}
            </CardDescription>
          </div>
          <IssueWarningDialog
            userId={userId}
            onIssued={() => setWarningsKey(k => k + 1)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <UserAdminWarnings
          key={warningsKey}
          userId={userId}
        />
      </CardContent>
    </Card>
  )
}
