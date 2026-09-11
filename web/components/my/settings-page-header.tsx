interface SettingsPageHeaderProps {
  description?: string
  title: string
}

export function SettingsPageHeader({ description, title }: SettingsPageHeaderProps) {
  return (
    <div data-pw='settings-page-header'>
      <h1
        className='text-2xl font-bold text-foreground'
        data-pw='settings-page-header-title'
      >
        {title}
      </h1>
      {description ? (
        <p
          className='mt-1 text-sm text-muted-foreground'
          data-pw='settings-page-header-description'
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
