import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import {
  createProfileFact,
  deleteProfileFact,
  getProfileFact,
  listProfileFacts,
  updateProfileFact,
} from '../domain/profile-facts/profileFact.service.js'
import {
  createProfileFactSchema,
  listProfileFactsQuerySchema,
  objectIdSchema,
  updateProfileFactSchema,
} from '../domain/profile-facts/profileFact.schema.js'

export const profileFactsRouter = Router()

function parseIdParam(req: { params: Record<string, string> }): string {
  return objectIdSchema.parse(req.params.id)
}

profileFactsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const query = listProfileFactsQuerySchema.parse(req.query)
  const facts = await listProfileFacts(userId, query)
  res.json({ facts })
})

profileFactsRouter.get('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = parseIdParam(req)
  const fact = await getProfileFact(userId, id)
  res.json({ fact })
})

profileFactsRouter.post('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const input = createProfileFactSchema.parse(req.body)
  const fact = await createProfileFact(userId, input)
  res.status(201).json({ fact })
})

profileFactsRouter.patch('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = parseIdParam(req)
  const patch = updateProfileFactSchema.parse(req.body)
  const fact = await updateProfileFact(userId, id, patch)
  res.json({ fact })
})

profileFactsRouter.delete('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = parseIdParam(req)
  await deleteProfileFact(userId, id)
  res.status(204).send()
})
