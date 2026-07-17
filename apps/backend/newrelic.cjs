'use strict'

/**
 * New Relic agent configuration.
 *
 * The agent is preloaded via `node -r newrelic dist/main.js` (see the Docker
 * CMD) and auto-discovers this file from the process working directory
 * (`/app/apps/backend`). Secrets come from environment variables — nothing
 * sensitive is committed here.
 */
exports.config = {
  app_name: [
    `${process.env.NEW_RELIC_APP_NAME || 'afmQuiz'} (${process.env.NODE_ENV || 'development'})`,
  ],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info',
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*',
    ],
  },
  error_collector: {
    enabled: true,
    ignore_status_codes: [401, 403, 404],
  },
}
