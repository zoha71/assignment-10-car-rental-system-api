try {
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = require('ws');
  }
} catch (e) {
  // WebSocket polyfill fallback
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const rentalRoutes = require('./routes/rentalRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

// Security and utility middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Health Check Endpoint (Used by Render for deployment health monitoring)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    allowPastDates: process.env.ALLOW_PAST_DATES !== 'false',
  });
});

// Root Information Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'Car Rental & Vehicle Fleet Management API',
    version: '1.0.0',
    documentation: 'See README.md or import postman/CarRental_API.postman_collection.json',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
      },
      vehicles: {
        list: 'GET /api/vehicles',
        details: 'GET /api/vehicles/:id',
        create: 'POST /api/vehicles [Admin]',
        update: 'PUT /api/vehicles/:id [Admin]',
        delete: 'DELETE /api/vehicles/:id [Admin]',
      },
      rentals: {
        book: 'POST /api/rentals',
        myBookings: 'GET /api/rentals/my-bookings',
        cancel: 'PATCH /api/rentals/:id/cancel',
        pickup: 'PATCH /api/rentals/:id/pickup',
        complete: 'PATCH /api/rentals/:id/complete',
      },
    },
  });
});

// Mount Feature API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/rentals', rentalRoutes);

// 404 & Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`🚗 Car Rental API running at http://${HOST}:${PORT}`);
    console.log(`   Health check available at http://${HOST}:${PORT}/health`);
  });
}

module.exports = app;
