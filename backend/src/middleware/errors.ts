import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../errors/apiError.js'
import { redactSecrets } from '../security/redact.js'

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
  const type =
    err !== null && typeof err === 'object' ? String((err as { type?: string }).type ?? '') : ''
  if (type === 'entity.too.large') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'request body exceeds the allowed size limit',
    }
  }
  if (type === 'entity.parse.failed') {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Malformed JSON body' }
  }
  if (err instanceof Error && err.message.includes('Cast to ObjectId failed')) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid id format' }
  }
  // Generic internal error — the response shape never includes stack traces,
  // connection strings, environment values or any request credentials.
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
    // Server-side diagnostic only — secrets are redacted before logging (C7/C9).
    console.error(`[error] ${code}: ${redactSecrets(err.message)}`)
  }
  const payload: Record<string, unknown> = { error: code, message }
  if (issues !== undefined) payload.issues = issues
  res.status(status).json(payload)
}
