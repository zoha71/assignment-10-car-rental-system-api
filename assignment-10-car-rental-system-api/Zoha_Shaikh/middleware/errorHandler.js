/**
 * Centralized Error Handling Middleware for Express & Supabase / Postgres Errors
 */

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, next) {
  // Handle JSON body parser error (e.g. malformed JSON payload)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload in request body.',
    });
  }

  // Handle Supabase / Postgres specific error codes
  if (err.code) {
    switch (err.code) {
      case '23P01': // Exclusion constraint (no_double_booking)
        return res.status(400).json({
          success: false,
          message: 'Vehicle already reserved during this timeframe.',
        });

      case '23503': // Foreign key violation
        return res.status(400).json({
          success: false,
          message:
            'Operation failed due to related records constraint. (Vehicle has rental history and cannot be deleted; set its status to maintenance instead).',
        });

      case '23505': // Unique violation
        return res.status(409).json({
          success: false,
          message: 'A record with these unique details already exists.',
        });

      case '23514': // Check constraint violation
        return res.status(400).json({
          success: false,
          message: err.message || 'Data violates table constraint rules (e.g., end_date >= start_date, daily_rate > 0).',
        });

      case 'PGRST116': // Single row expected but none returned
        return res.status(404).json({
          success: false,
          message: 'Requested resource was not found.',
        });

      default:
        break;
    }
  }

  // Handle custom status code errors
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  const response = {
    success: false,
    message: err.message || 'Internal server error occurred.',
  };

  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  // Log error on server console for observability
  console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
