const { supabaseAdmin } = require('../config/supabase');

/**
 * Authentication middleware: verifies Supabase Bearer token.
 * Attaches authenticated user details to `req.user`.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Missing or malformed Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token missing.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid, expired, or revoked authentication token.',
      });
    }

    // Attach user info to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || '',
      role: user.app_metadata?.role || 'customer',
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Authorization middleware: ensures the user has the 'admin' role.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.',
    });
  }

  next();
}

module.exports = {
  authenticate,
  requireAdmin,
};
