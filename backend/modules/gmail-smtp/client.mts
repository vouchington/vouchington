import nodemailer from 'nodemailer'

let transport: ReturnType<typeof nodemailer.createTransport> | undefined

export function getGmailTransport(): ReturnType<typeof nodemailer.createTransport> {
  if (!transport) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_SMTP_USER,
        pass: process.env.GMAIL_SMTP_APP_PASSWORD,
      },
    })
  }
  return transport
}
