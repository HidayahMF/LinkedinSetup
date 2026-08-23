import { Router } from 'express'
import { z } from 'zod'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import { handleAgentCommand } from '../agent/orchestrator.js'
import { AgentCommandModel, AgentSessionModel } from '../domain/sessions/session.model.js'

export const agentRouter = Router()

const commandSchema = z
  .object({
    command: z.string().trim().min(1).max(2000),
    sessionId: z.string().trim().max(64).optional(),
  })
  .strict()

agentRouter.post('/command', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const body = commandSchema.parse(req.body)
  const result = await handleAgentCommand(userId, body.command, body.sessionId)
  res.json(result)
})

agentRouter.get('/sessions/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const session = await AgentSessionModel.findOne({ _id: id, userId }).exec()
  if (!session) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }
  const commands = await AgentCommandModel.find({ userId, sessionId: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .exec()
  res.json({
    session: session.toJSON(),
    commands: commands.map((c) => c.toJSON()),
  })
})
