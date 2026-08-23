import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { getOrCreateProfile, updateProfile } from '../domain/profile/profile.service.js'
import { reviewRequestSchema } from '../domain/profile/profile.schema.js'
import { runProfileReview } from '../agent/reviewer.js'
import { createImprovementProposal } from '../domain/proposal/proposal.service.js'
import { improveRequestSchema } from '../domain/profile/profile.schema.js'

export const profileRouter = Router()

profileRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const profile = await getOrCreateProfile(userId)
  res.json({ profile })
})

profileRouter.put('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const result = await updateProfile(userId, req.body, {
    source: 'user_edit',
    label: 'Direct user edit via profile editor',
  })
  res.json(result)
})

profileRouter.post('/review', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const input = reviewRequestSchema.parse(req.body ?? {})
  const review = await runProfileReview(userId, input.target)
  res.json({ review })
})

profileRouter.post('/improve', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const input = improveRequestSchema.parse(req.body ?? {})
  const proposal = await createImprovementProposal(userId, {
    target: input.target,
    itemId: input.itemId,
    instructions: input.instructions,
  })
  res.status(201).json({ proposal })
})
