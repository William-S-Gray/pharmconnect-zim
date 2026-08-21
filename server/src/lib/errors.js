/**
 * Errors the API is willing to describe to the client.
 *
 * Anything thrown that is not an ApiError is treated as a bug and reported
 * as a bare 500 — the message never reaches the browser. That keeps
 * Postgres errors, which happily quote table names, column names and the
 * offending values, out of responses.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest   = (msg = 'Bad request', details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Not authenticated')     => new ApiError(401, msg);
export const forbidden    = (msg = 'Access denied')         => new ApiError(403, msg);
export const notFound     = (msg = 'Not found')             => new ApiError(404, msg);
export const conflict     = (msg = 'Conflict')              => new ApiError(409, msg);
export const tooMany      = (msg = 'Too many requests')     => new ApiError(429, msg);

/**
 * Wraps an async route handler so a rejected promise reaches Express's
 * error handler. Express 4 does not await handlers, so without this an
 * async throw becomes an unhandled rejection and the request hangs until
 * the client times out.
 */
export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Unique violation. Surfacing this as 409 rather than 500 is worth the
  // special case because the race it represents is normal: two people
  // registering the same pharmacy email at once.
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'That record already exists' });
  }
  // Foreign key violation — the client referenced something that is gone.
  if (err?.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  console.error('[api] unhandled error', {
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id ?? null,
    err,
  });
  return res.status(500).json({ error: 'Internal server error' });
}
