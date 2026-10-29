const mode = process.argv[2]

if (mode === 'built') {
  const { renderWelcomeEmail } = await import('@email-templates/core')
  console.log(JSON.stringify(await renderWelcomeEmail({ uiLocale: 'es' })))
} else {
  const { emailCopy } = await import('../catalog-copy.mts')
  if (mode === 'json') {
    console.log(JSON.stringify({ preview: emailCopy('en', 'welcome')('preview') }))
  } else if (mode === 'sqlite') {
    console.log(
      JSON.stringify({
        heading: emailCopy('en', 'welcome')('heading', { userName: 'Jordan' }),
        button: emailCopy('es', 'welcome')('button'),
        locales: Object.fromEntries(
          ['en', 'es', 'fr', 'pt'].map(locale => [
            locale,
            {
              footer: emailCopy(locale, 'shared')('footer', { year: 2026 }),
              subject: emailCopy(locale, 'login-token')('subject'),
            },
          ]),
        ),
      }),
    )
  } else {
    throw new Error(`Unknown catalog-copy probe mode: ${mode}`)
  }
}
