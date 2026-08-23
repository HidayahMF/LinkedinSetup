import { Router } from 'express'
import { z } from 'zod'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import {
  diffProfileVersions,
  listProfileVersions,
  restoreProfileVersion,
} from '../domain/versions/version.service.js'

export const versionsRouter = Router()

const diffQuerySchema = z
  .object({
    from: objectIdSchema,
    to: objectIdSchema,
  })
  .strict()

versionsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const versions = await listProfileVersions(userId)
  res.json({ versions })
})

versionsRouter.get('/diff', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const query = diffQuerySchema.parse(req.query)
  const result = await diffProfileVersions(userId, query.from, query.to)
  res.json({
    changes: result.changes,
    from: { id: result.from.id, versionNumber: result.from.versionNumber },
    to: { id: result.to.id, versionNumber: result.to.versionNumber },
  })
})

versionsRouter.post('/:id/restore', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const result = await restoreProfileVersion(userId, id)
  res.json({
    restoredFromVersion: result.restoredFrom,
    newVersion: result.newVersion,
  })
})
