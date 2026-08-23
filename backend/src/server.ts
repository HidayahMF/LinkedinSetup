import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectMongo, mongoConnectionState } from './database/mongo.js'
import dns from 'node:dns'

async function main(): Promise<void> {
  if (env.DNS_SERVERS) {
    // Some local resolvers refuse SRV queries (breaks mongodb+srv lookups)
    const servers = env.DNS_SERVERS.split(',').map((s) => s.trim())
    dns.setServers(servers)
    console.log(`[dns] using resolvers: ${servers.join(', ')}`)
  }
  if (env.MONGODB_URI) {
    try {
      await connectMongo(env.MONGODB_URI, env.MONGODB_DATABASE)
      console.log(`[mongo] ${mongoConnectionState()} db=${env.MONGODB_DATABASE}`)
    } catch (err) {
      console.warn(`[mongo] connection failed: ${(err as Error).message}`)
      console.warn('[mongo] continuing without database; /health remains available')
    }
  } else {
    console.warn('[mongo] MONGODB_URI not set; skipping database connection')
  }

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`)
  })

  const shutdown = (): void => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
