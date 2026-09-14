import { LoginForm } from '@/components/auth/login-form'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { VouchaLogo } from '@/components/brand/voucha-logo'
import { LoginUrlCleanup } from './login-url-cleanup'
import { sanitizeLoginNext } from '@/lib/auth/login-url'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Sign in or create account')

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function getFirstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function getIntentMessage(intent: string): string {
  switch (intent) {
    case 'follow': {
      return "Sign in to follow — we'll send you right back."
    }
    case 'vote': {
      return "Sign in to cast your vote — we'll send you right back."
    }
    case 'write': {
      return "Sign in to start writing — we'll send you right back."
    }
    default: {
      return "Use your email or a provider to get started — it's free."
    }
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations()
  const user = await getCurrentUser()
  const params = await searchParams

  // Redirect if already logged in
  if (user) {
    redirect('/')
  }

  const next = sanitizeLoginNext(getFirstSearchParam(params.next))
  const intent = getFirstSearchParam(params.intent)

  return (
    <div className='flex min-h-screen items-center justify-center bg-muted/50'>
      <div
        className='w-full max-w-md space-y-6 rounded-md border bg-card p-6 shadow-sm dark:shadow-none'
        data-pw='localization-login-page'
      >
        <div
          className='text-center'
          data-pw='localization-tmux-smoke-login-page'
        >
          <VouchaLogo className='mx-auto mb-4 h-6 w-auto' />
          <h1
            className='text-2xl font-bold'
            data-pw='login-form-heading'
          >
            {t('extracted.login.page.signInOrCreateAccount_c29dcc85')}
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>{getIntentMessage(intent)}</p>
        </div>

        <LoginUrlCleanup
          enabled={Boolean(params.emailAddress || params.otp || params.login_attempt_id)}
        />

        <LoginForm
          initialEmailAddress={getFirstSearchParam(params.emailAddress)}
          initialOtp={getFirstSearchParam(params.otp)}
          initialLoginAttemptId={getFirstSearchParam(params.login_attempt_id)}
          redirectTo={next}
        />
      </div>
    </div>
  )
}
