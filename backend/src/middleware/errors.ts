import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../errors/apiError.js'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path })
}

function resolveError(err: unknown): { status: number; code: string; message: string; issues?: unknown } {
  if (err instanceof ApiError) {
    return { status: err.status, code: err.code, message: err.message }
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      issues: err.issues,
    }
  }
  if (
    err !== null &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Malformed JSON body' }
  }
  if (err instanceof Error && err.message.includes('Cast to ObjectId failed')) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid id format' }
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const { status, code, message, issues } = resolveError(err)
  if (status >= 500 && err instanceof Error) {
    console.error(`[error] ${code}: ${err.message}`)
  }
  const payload: Record<string, unknown> = { error: code, message }
  if (issues !== undefined) payload.issues = issues
  res.status(status).json(payload)
}
