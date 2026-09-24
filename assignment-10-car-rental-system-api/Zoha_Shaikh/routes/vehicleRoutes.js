const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public endpoints
router.get('/', vehicleController.getAllVehicles);
router.get('/:id', vehicleController.getVehicleById);

// Protected admin endpoints
router.post('/', authenticate, requireAdmin, vehicleController.createVehicle);
router.put('/:id', authenticate, requireAdmin, vehicleController.updateVehicle);
router.delete('/:id', authenticate, requireAdmin, vehicleController.deleteVehicle);

module.exports = router;
