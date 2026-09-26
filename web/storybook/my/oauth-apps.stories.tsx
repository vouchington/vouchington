import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import { fn } from 'storybook/test'
import { OAuthAppsManager } from '@/components/my/oauth-apps-manager'
import { ClientSecretAlert } from '@/components/my/oauth-apps-manager/client-secret-alert'
import { EditOAuthAppForm } from '@/components/my/oauth-apps-manager/edit-oauth-app-form'
import { OAuthAppDetailsFields } from '@/components/my/oauth-apps-manager/oauth-app-details-fields'
import { OAuthAppRow } from '@/components/my/oauth-apps-manager/oauth-app-row'
import { RegisterOAuthAppForm } from '@/components/my/oauth-apps-manager/register-oauth-app-form'
import type { OAuthApp } from '@/types/oauth-apps'
import { storybookScopeCatalog } from './fixtures/scope-catalog'

const meta = {
  title: 'My/OAuth Apps',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const confidentialApp: OAuthApp = {
  id: 'storybook-oauth-app',
  client_id: 'voucha_storybook-agent',
  client_name: 'Storybook Agent',
  client_type: 'confidential',
  token_endpoint_auth_method: 'client_secret_basic',
  redirect_uris: ['https://agent.example.com/oauth/callback'],
  scopes: ['mcp.user:read', 'mcp.user:write'],
  verified_at: '2026-09-02T12:00:00.000Z',
  created_at: '2026-09-01T12:00:00.000Z',
  updated_at: '2026-09-01T12:00:00.000Z',
}

const publicApp: OAuthApp = {
  ...confidentialApp,
  id: 'storybook-public-app',
  client_id: 'voucha_storybook-cli',
  client_name: 'Storybook CLI',
  client_type: 'public',
  token_endpoint_auth_method: 'none',
  redirect_uris: ['http://127.0.0.1:8765/callback'],
  scopes: ['posts:read'],
  verified_at: null,
}

const resolveTrue = fn(async () => true)

function Frame({ children }: { children: ReactNode }) {
  return <div className='w-[min(92vw,720px)]'>{children}</div>
}

export const Manager: Story = {
  render: () => (
    <Frame>
      <OAuthAppsManager
        initialData={{
          results: [confidentialApp, publicApp],
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        }}
        scopeCatalog={storybookScopeCatalog}
      />
    </Frame>
  ),
}

export const Rows: Story = {
  render: () => (
    <Frame>
      <ul className='space-y-3'>
        {[confidentialApp, publicApp].map(app => (
          <OAuthAppRow
            key={app.id}
            app={app}
            onRevoke={fn(async () => {})}
            onRotate={fn(async () => {})}
            onUpdate={resolveTrue}
          />
        ))}
      </ul>
    </Frame>
  ),
}

export const RegisterForm: Story = {
  render: () => (
    <Frame>
      <RegisterOAuthAppForm
        isAdmin={false}
        scopeCatalog={storybookScopeCatalog}
        onRegister={resolveTrue}
      />
    </Frame>
  ),
}

export const EditVerifiedApp: Story = {
  render: () => (
    <Frame>
      <EditOAuthAppForm
        app={confidentialApp}
        onCancel={fn()}
        onSave={resolveTrue}
      />
    </Frame>
  ),
}

export const DetailsFields: Story = {
  render: () => (
    <Frame>
      <OAuthAppDetailsFields
        idPrefix='storybook-oauth-app'
        name='Storybook Agent'
        redirectUris={'https://agent.example.com/oauth/callback\nhttps://agent.example.com/alt'}
        setName={fn()}
        setRedirectUris={fn()}
      />
    </Frame>
  ),
}

export const IssuedClientSecret: Story = {
  render: () => (
    <Frame>
      <ClientSecretAlert
        clientId='voucha_storybook-agent'
        clientSecret='storybook-one-time-client-secret'
        onDismiss={fn()}
      />
    </Frame>
  ),
}
