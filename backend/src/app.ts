import express from 'express'
import { healthRouter } from './routes/health.js'
import { profileFactsRouter } from './routes/profileFacts.js'
import { profileRouter } from './routes/profile.js'
import { versionsRouter } from './routes/versions.js'
import { proposalsRouter } from './routes/proposals.js'
import { approvalsRouter } from './routes/approvals.js'
import { linkedinRouter } from './routes/linkedin.js'
import { postsRouter } from './routes/posts.js'
import { agentRouter } from './routes/agent.js'
import { logsRouter } from './routes/logs.js'
import { reviewsRouter } from './routes/reviews.js'
import { requireAuthenticatedUser } from './security/authContext.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'

export function createApp(): express.Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.use('/health', healthRouter)

  const api = express.Router()
  api.use('/profile-facts', profileFactsRouter)
  api.use('/profile', profileRouter)
  api.use('/profile/versions', versionsRouter)
  api.use('/proposals', proposalsRouter)
  api.use('/approvals', approvalsRouter)
  api.use('/linkedin', linkedinRouter)
  api.use('/posts', postsRouter)
  api.use('/agent', agentRouter)
  api.use('/logs', logsRouter)
  api.use('/reviews', reviewsRouter)

  app.use('/api', requireAuthenticatedUser, api)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
