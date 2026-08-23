import type { NextFunction, Request, Response } from 'express'
import { Types } from 'mongoose'
import { ApiError } from '../errors/apiError.js'

export interface AuthenticatedUser {
  id: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

const USER_ID_HEADER = 'x-user-id'

export function requireAuthenticatedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.header(USER_ID_HEADER)
  if (!raw || !Types.ObjectId.isValid(raw)) {
    next(ApiError.unauthorized('Authenticated user context required'))
    return
  }
  req.user = { id: new Types.ObjectId(raw).toString() }
  next()
}

export function getAuthenticatedUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized('Authenticated user context required')
  return req.user.id
}
