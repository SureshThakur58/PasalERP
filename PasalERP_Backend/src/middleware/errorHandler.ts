import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const status = Number(err?.statusCode) || 500;
  res.status(status).json({
  success: false,
  message:
    status === 500
      ? (process.env.NODE_ENV === 'development'
          ? err?.message || 'Internal server error'
          : 'Internal server error')
      : err?.message || 'Request failed'
});
};

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
