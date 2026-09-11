import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isTurnstileAlwaysApprove } from '@services/captcha'

type CaptchaConfigResponse = {
  always_approve: boolean
}

app.route('/api/v1/captcha-config').get((ctx: Context) => {
  ctx.set('Cache-Control', 'private, no-store')
  const body: CaptchaConfigResponse = {
    always_approve: isTurnstileAlwaysApprove(),
  }
  ctx.json(body)
})
