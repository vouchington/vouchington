export const virtualSources = {
  'valid-body-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').post(async (ctx: any) =>
      validateRequestContract(ctx, 'POST:/api/v1/search', { body: await ctx.request.json() }))
  `,
  'wrong-body-carrier': `
    declare const app: any
    declare const unrelated: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').post(async (ctx: any) =>
      validateRequestContract(ctx, 'POST:/api/v1/search', { body: await unrelated.request.json() }))
  `,
  'query-helper': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    function readSearch(ctx: any) { return ctx.query.term }
    app.route('/api/v1/search').get((renamed: any) => {
      validateRequestContract(renamed, 'GET:/api/v1/search', { path: renamed.params })
      return readSearch(renamed)
    })
  `,
  'dead-query-helper': `
    declare const app: any
    function readSearch(ctx: any) { return ctx.query.term }
    app.route('/api/v1/search').get((_renamed: any) => {
      function unused() { return readSearch(_renamed) }
      return 'ok'
    })
  `,
  'wrong-key-helper': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    function validate(ctx: any, operation: string) {
      validateRequestContract(ctx, operation, { query: ctx.query })
    }
    app.route('/api/v1/search').get((ctx: any) => validate(ctx, 'GET:/api/v1/other'))
  `,
  'dynamic-key-helper': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    function validate(ctx: any, operation: string) {
      validateRequestContract(ctx, operation, { query: ctx.query })
    }
    app.route('/api/v1/search').get((ctx: any) => validate(ctx, ctx.query.operation))
  `,
  'dead-validator': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) => {
      function unused() { validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query }) }
      return 'ok'
    })
  `,
  'spoof-validator': `
    declare const app: any
    function validateRequestContract(ctx: any, operation: string, options: object): void {}
    app.route('/api/v1/search').get((ctx: any) =>
      validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.query }))
  `,
  'aliased-query': `
    declare const app: any
    app.route('/api/v1/search').get((ctx: any) => {
      const query = ctx.query
      return query['term']
    })
  `,
  'destructured-query': `
    declare const app: any
    app.route('/api/v1/search').get((ctx: any) => {
      const { new_filter: filter } = ctx.query
      return filter
    })
  `,
  'dynamic-query': `
    declare const app: any
    app.route('/api/v1/search').get((ctx: any) => ctx.query[ctx.query.key])
  `,
  'wrong-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) =>
      validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.params }))
  `,
  'normalized-query-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    declare function normalize(query: any): any
    app.route('/api/v1/search').get((ctx: any) => {
      const query = normalize(ctx.query)
      validateRequestContract(ctx, 'GET:/api/v1/search', { query })
      return query.term
    })
  `,
  'assigned-query-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) => {
      const query: Record<string, unknown> = {}
      query.term = ctx.query.term
      validateRequestContract(ctx, 'GET:/api/v1/search', { query })
    })
  `,
  'dead-assigned-query-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) => {
      const query: Record<string, unknown> = {}
      function unused() { query.term = ctx.query.term }
      validateRequestContract(ctx, 'GET:/api/v1/search', { query })
    })
  `,
  'empty-query-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) =>
      validateRequestContract(ctx, 'GET:/api/v1/search', { query: {} }))
  `,
  'unrelated-query-carrier': `
    declare const app: any
    declare const unrelated: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) =>
      validateRequestContract(ctx, 'GET:/api/v1/search', { query: unrelated.query }))
  `,
  'cross-carrier': `
    declare const app: any
    declare function validateRequestContract(ctx: any, operation: string, options: object): void
    app.route('/api/v1/search').get((ctx: any) =>
      validateRequestContract(ctx, 'GET:/api/v1/search', { query: ctx.params, path: ctx.query }))
  `,
  'live-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      ctx.assert(!requestIdParam || isUUID(requestIdParam), 422, 'invalid')
    })
  `,
  'dead-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      function unused() { ctx.assert(!ctx.query.request_id || isUUID(ctx.query.request_id), 422, 'invalid') }
      return 'ok'
    })
  `,
  'wrong-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      ctx.assert(!ctx.query.request_id || isUUID(ctx.params.id), 422, 'invalid')
    })
  `,
  'always-true-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      ctx.assert(true || isUUID(requestIdParam), 422, 'invalid')
    })
  `,
  'fake-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      ctx.assert(!requestIdParam || isUUID(requestIdParam), 422, 'invalid')
    })
  `,
  'unrelated-inline-uuid': `
    declare const app: any
    declare const unrelated: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      unrelated.assert(!requestIdParam || isUUID(requestIdParam), 422, 'invalid')
    })
  `,
  'constant-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      ctx.assert(!requestIdParam || isUUID('fixed'), 422, 'invalid')
    })
  `,
  'mixed-inline-uuid': `
    declare const app: any
    function isUUID(value: string): boolean { return true }
    app.route('/api/v1/search').get((ctx: any) => {
      const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
      ctx.assert(!requestIdParam || isUUID(ctx.params.id || requestIdParam), 422, 'invalid')
    })
  `,
} as const
