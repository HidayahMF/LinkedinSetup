import { Router } from 'express'
import { getAuthenticatedUserId } from '../security/authContext.js'
import { ReviewModel } from '../domain/review/review.model.js'

export const reviewsRouter = Router()

reviewsRouter.get('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req)
  const reviews = await ReviewModel.find({ userId }).sort({ createdAt: -1 }).limit(50).exec()
  res.json({ reviews: reviews.map((r) => r.toJSON()) })
})
