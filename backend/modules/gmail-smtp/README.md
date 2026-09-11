# @modules/gmail-smtp

Gmail SMTP email transport via nodemailer — an alternative to AWS SES for sending transactional email.

## Exports

### `getGmailTransport()`

Returns a lazily-initialized nodemailer transport configured for Gmail SMTP. Reads `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD` from the environment.

### `sendGmailEmail(options: SendEmailOptions)`

Validates `options` then sends an email using the Gmail transport. `SendEmailOptions` is the shared type from `@modules/utils/email`.

## Related

- Parent: [../README.md](../README.md)
- AWS SES alternative: [../aws/README.md](../aws/README.md)
