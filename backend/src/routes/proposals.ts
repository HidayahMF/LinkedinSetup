import { Router } from 'express'
import { z } from 'zod'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import {
  approveProposalByOwner,
  editProposalByOwner,
  getProposalByOwner,
  listProposalsByOwner,
  rejectProposalByOwner,
  toProposalDTO,
} from '../domain/proposal/proposal.service.js'

export const proposalsRouter = Router()

const approveSchema = z
  .object({
    approvedActionIds: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    rejectedActionIds: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  })
  .strict()

const editSchema = z
  .object({
    edits: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(160),
            after: z.string().trim().max(6000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()

proposalsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const state = typeof req.query.state === 'string' ? req.query.state : undefined
  const proposals = await listProposalsByOwner(
    userId,
    state ? { state: state as never } : {},
  )
  res.json({ proposals })
})

proposalsRouter.get('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const proposal = await getProposalByOwner(userId, id)
  res.json({ proposal: toProposalDTO(proposal) })
})

/**
 * Explicit structured approval (flow.md §43/§45.2). Natural language never authorizes
 * execution — only this structured record does.
 */
proposalsRouter.post('/:id/approve', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const scope = approveSchema.parse(req.body ?? {})
  const result = await approveProposalByOwner(userId, id, scope)
  res.json({
    approval: toProposalDTO(result.proposal),
    approvalRequest: {
      id: String(result.approval._id),
      status: result.approval.status,
      expiresAt: result.approval.expiresAt,
      approvedActionIds: result.approval.approvedActionIds,
      rejectedActionIds: result.approval.rejectedActionIds,
    },
    queue: result.queueCounts,
  })
})

proposalsRouter.post('/:id/reject', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const proposal = await rejectProposalByOwner(userId, id)
  res.json({ proposal: toProposalDTO(proposal) })
})

/** USER EDIT creates a NEW version and invalidates old approvals (flow.md §40.1/§45). */
proposalsRouter.post('/:id/edit', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const body = editSchema.parse(req.body)
  const proposal = await editProposalByOwner(userId, id, body.edits)
  res.json({ proposal: toProposalDTO(proposal) })
})
