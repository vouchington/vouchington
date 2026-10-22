export const gracefulShutdownPeriodSeconds =
  Number(process.env.GRACEFUL_SHUTDOWN_PERIOD_SECONDS) || 10

export const ADMIN_EMAIL_ADDRESS = process.env.ADMIN_EMAIL_ADDRESS
