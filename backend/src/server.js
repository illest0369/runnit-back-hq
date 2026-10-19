import 'dotenv/config'

import { createApp } from './app.js'

const requestedPort = Number.parseInt(process.env.PORT || '3001', 10)
const port = Number.isSafeInteger(requestedPort) && requestedPort > 0 ? requestedPort : 3001

const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'RBHQ backend listening',
    port,
    service: 'rbhq-backend',
  }))
})

function shutdown(signal) {
  console.log(JSON.stringify({
    level: 'info',
    message: 'RBHQ backend shutting down',
    signal,
    service: 'rbhq-backend',
  }))
  server.close((error) => {
    process.exit(error ? 1 : 0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
