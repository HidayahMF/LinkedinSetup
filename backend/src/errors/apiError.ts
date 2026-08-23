export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message)
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, 'AUTHENTICATION_ERROR', message)
  }

  static forbidden(message = 'Not allowed'): ApiError {
    return new ApiError(403, 'AUTHORIZATION_ERROR', message)
  }

  static validation(message: string): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message)
  }

  static conflict(code: string, message: string): ApiError {
    return new ApiError(409, code, message)
  }

  static gone(message = 'Resource expired'): ApiError {
    return new ApiError(410, 'APPROVAL_EXPIRED', message)
  }

  static missingInformation(message: string): ApiError {
    return new ApiError(422, 'MISSING_INFORMATION', message)
  }

  static approvalRequired(message = 'Approval required before this operation'): ApiError {
    return new ApiError(403, 'APPROVAL_REQUIRED', message)
  }
}
