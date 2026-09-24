const { supabaseAdmin, createAuthClient } = require('../config/supabase');
const { validateRegistration, validateLogin } = require('../utils/validators');

/**
 * Register customer with Supabase Auth Admin API
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const validationErrors = validateRegistration(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join(' '),
      });
    }

    const { email, password, name } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Create user via Admin API with email pre-confirmed
    const { data: createdData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
      app_metadata: { role: 'customer' }, // Default role is always customer
    });

    if (createError) {
      // Map Supabase error messages to user-friendly messages
      let friendlyMessage = createError.message;
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        friendlyMessage = 'A user with this email address already exists.';
      }
      return res.status(400).json({
        success: false,
        message: friendlyMessage,
      });
    }

    // Automatically sign in the user to return access tokens
    const authClient = createAuthClient();
    const { data: sessionData, error: sessionError } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (sessionError || !sessionData.session) {
      return res.status(201).json({
        success: true,
        message: 'User registered successfully. Please log in.',
        user: {
          id: createdData.user.id,
          email: createdData.user.email,
          name: createdData.user.user_metadata?.name || name,
          role: 'customer',
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered and authenticated successfully.',
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.user_metadata?.name || name,
        role: sessionData.user.app_metadata?.role || 'customer',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Login customer or admin and return access token
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const validationErrors = validateLogin(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join(' '),
      });
    }

    const { email, password } = req.body;
    const authClient = createAuthClient();

    const { data, error } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || '',
        role: data.user.app_metadata?.role || 'customer',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe,
};
