import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { objectIdSchema } from '../domain/profile-facts/profileFact.schema.js'
import {
  confirmPublishByOwner,
  createDraftByOwner,
  getPostByOwner,
  listPostsByOwner,
  requestPublishByOwner,
  reviewDraftByOwner,
  updateDraftByOwner,
} from '../domain/posts/post.service.js'

export const postsRouter = Router()

postsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const posts = await listPostsByOwner(userId)
  res.json({ posts })
})

postsRouter.get('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  res.json({ post: await getPostByOwner(userId, id) })
})

postsRouter.post('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const post = await createDraftByOwner(userId, req.body)
  res.status(201).json({ post })
})

postsRouter.patch('/:id', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const post = await updateDraftByOwner(userId, id, req.body)
  res.json({ post })
})

postsRouter.post('/:id/review', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const post = await reviewDraftByOwner(userId, id)
  res.json({ post })
})

/** Publish REQUEST — creates the CRITICAL proposal; nothing is public yet. */
postsRouter.post('/:id/publish-request', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const post = await requestPublishByOwner(userId, id)
  res.json({ post })
})

/** Final explicit CONFIRMATION immediately before execution (flow.md §36/§46). */
postsRouter.post('/:id/publish-confirm', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const id = objectIdSchema.parse(req.params.id)
  const post = await confirmPublishByOwner(userId, id)
  res.json({ post })
})
