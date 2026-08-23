import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import {
  cancelAction,
  executeAction,
  getActionByOwner,
  listActionsByOwner,
  retryPausedOrFailedAction,
  runApprovedQueue,
  skipAction,
} from '../execution/executorController.js'

export const linkedinRouter = Router()

linkedinRouter.get('/actions', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const actions = await listActionsByOwner(userId)
  res.json({ actions })
})

linkedinRouter.get('/actions/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const action = await getActionByOwner(userId, id)
  res.json({ action })
})

/**
 * The ONLY execution path. Loads the immutable approved payload from the database and
 * enforces the full Final Execution Contract (flow.md §86 + §101) before any automation runs.
 */
linkedinRouter.post('/actions/:id/execute', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const report = await executeAction(userId, id)
  res.json({
    executed: report.executed,
    status: report.action?.status,
    result: report.action?.result ?? null,
    reason: report.reason ?? null,
    checklist: report.checklist,
    action: report.action,
  })
})

linkedinRouter.post('/execution/run', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const report = await runApprovedQueue(userId)
  res.json(report)
})

linkedinRouter.post('/actions/:id/retry', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const action = await retryPausedOrFailedAction(userId, id)
  res.json({ action })
})

linkedinRouter.post('/actions/:id/skip', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const action = await skipAction(userId, id)
  res.json({ action })
})

linkedinRouter.post('/actions/:id/cancel', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const action = await cancelAction(userId, id)
  res.json({ action })
})
