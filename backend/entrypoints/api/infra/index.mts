import app from '@voucha/api/app'

app.route('/infra/ping').get(ctx => {
  ctx.set('Cache-Control', 'max-age=0,private,no-cache,no-store,must-revalidate')
  ctx.set('X-Voucha-Capabilities', 'absolute-sideload-urls-v1')
  ctx.response.text('pong')
})
