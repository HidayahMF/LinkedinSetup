import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { AuditEventModel } from '../audit/audit.model.js'

export const logsRouter = Router()

logsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const limitRaw = Number(req.query.limit ?? 100)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100
  const events = await AuditEventModel.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .exec()
  res.json({ logs: events.map((e) => e.toJSON()) })
})
