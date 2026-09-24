const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const { authenticate } = require('../middleware/auth');

// All rental operations require authentication
router.use(authenticate);

// List user's own bookings
router.get('/my-bookings', rentalController.getMyBookings);

// Book a new rental
router.post('/', rentalController.bookRental);

// State transition operations
router.patch('/:id/cancel', rentalController.cancelRental);
router.patch('/:id/pickup', rentalController.pickupRental);
router.patch('/:id/complete', rentalController.completeRental);

module.exports = router;
