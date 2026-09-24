const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected auth profile route
router.get('/me', authenticate, authController.getMe);

module.exports = router;
