export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  if (status >= 500) {
    console.error('[error]', err.message);
  }
  res.status(status).json({
    code: status === 500 ? -1 : status,
    message: status === 500 ? '服务器内部错误' : err.message,
    error_code: code,
  });
}
