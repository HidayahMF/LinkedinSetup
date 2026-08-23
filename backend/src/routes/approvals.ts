import { Router } from 'express'
import { z } from 'zod'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import {
  getApprovalByOwner,
  listApprovalsByOwner,
  toApprovalDTO,
} from '../domain/approval/approval.service.js'

export const approvalsRouter = Router()

const statusQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  })
  .strict()

approvalsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const query = statusQuerySchema.parse(req.query ?? {})
  const approvals = await listApprovalsByOwner(userId, query)
  res.json({ approvals })
})

approvalsRouter.get('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const approval = await getApprovalByOwner(userId, id)
  res.json({ approval: toApprovalDTO(approval) })
})
