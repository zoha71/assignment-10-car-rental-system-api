const { isValidDateString, parseDateUTC, daysInclusive, isDateInPast } = require('./dateHelper');

const VALID_CATEGORIES = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
const VALID_VEHICLE_STATUSES = ['available', 'rented', 'maintenance'];
const VALID_RENTAL_STATUSES = ['booked', 'active', 'completed', 'cancelled'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates email format.
 */
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Validates registration input.
 */
function validateRegistration(body) {
  const { email, password, name } = body;
  const errors = [];

  if (!email || !isValidEmail(email)) {
    errors.push('Valid email is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters long.');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and cannot be empty.');
  }

  return errors;
}

/**
 * Validates login input.
 */
function validateLogin(body) {
  const { email, password } = body;
  const errors = [];

  if (!email || !isValidEmail(email)) {
    errors.push('Valid email is required.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  }

  return errors;
}

/**
 * Validates positive integer ID from route params.
 */
function isValidId(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0;
}

/**
 * Validates vehicle creation input.
 */
function validateVehicleCreate(body) {
  const errors = [];
  const { brand, model, year, category, daily_rate, fuel_type, seating_capacity, status } = body;

  if (!brand || typeof brand !== 'string' || brand.trim() === '') {
    errors.push('brand is required and must be a non-empty string.');
  }

  if (!model || typeof model !== 'string' || model.trim() === '') {
    errors.push('model is required and must be a non-empty string.');
  }

  const currentYear = new Date().getUTCFullYear();
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 1980 || parsedYear > currentYear + 1) {
    errors.push(`year must be an integer between 1980 and ${currentYear + 1}.`);
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  }

  const rate = Number(daily_rate);
  if (isNaN(rate) || rate <= 0) {
    errors.push('daily_rate must be a number greater than 0.');
  }

  if (!fuel_type || typeof fuel_type !== 'string' || fuel_type.trim() === '') {
    errors.push('fuel_type is required and must be a non-empty string.');
  }

  if (seating_capacity !== undefined) {
    const seats = Number(seating_capacity);
    if (!Number.isInteger(seats) || seats < 1) {
      errors.push('seating_capacity must be an integer greater than or equal to 1.');
    }
  }

  if (status !== undefined) {
    if (!VALID_VEHICLE_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${VALID_VEHICLE_STATUSES.join(', ')}.`);
    }
  }

  return errors;
}

/**
 * Validates vehicle update input.
 */
function validateVehicleUpdate(body) {
  const errors = [];
  const allowedFields = ['brand', 'model', 'year', 'category', 'daily_rate', 'fuel_type', 'seating_capacity', 'status'];
  const providedFields = Object.keys(body).filter((k) => allowedFields.includes(k));

  if (providedFields.length === 0) {
    errors.push(`At least one valid field to update must be provided (${allowedFields.join(', ')}).`);
    return errors;
  }

  if (body.brand !== undefined && (typeof body.brand !== 'string' || body.brand.trim() === '')) {
    errors.push('brand must be a non-empty string.');
  }

  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.trim() === '')) {
    errors.push('model must be a non-empty string.');
  }

  if (body.year !== undefined) {
    const currentYear = new Date().getUTCFullYear();
    const parsedYear = Number(body.year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1980 || parsedYear > currentYear + 1) {
      errors.push(`year must be an integer between 1980 and ${currentYear + 1}.`);
    }
  }

  if (body.category !== undefined && !VALID_CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  }

  if (body.daily_rate !== undefined) {
    const rate = Number(body.daily_rate);
    if (isNaN(rate) || rate <= 0) {
      errors.push('daily_rate must be a number greater than 0.');
    }
  }

  if (body.fuel_type !== undefined && (typeof body.fuel_type !== 'string' || body.fuel_type.trim() === '')) {
    errors.push('fuel_type must be a non-empty string.');
  }

  if (body.seating_capacity !== undefined) {
    const seats = Number(body.seating_capacity);
    if (!Number.isInteger(seats) || seats < 1) {
      errors.push('seating_capacity must be an integer greater than or equal to 1.');
    }
  }

  if (body.status !== undefined) {
    if (!VALID_VEHICLE_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${VALID_VEHICLE_STATUSES.join(', ')}.`);
    }
  }

  return errors;
}

/**
 * Validates rental booking request.
 */
function validateRentalCreate(body) {
  const errors = [];
  const { vehicle_id, start_date, end_date, customer_name, customer_email } = body;

  if (!vehicle_id || !isValidId(vehicle_id)) {
    errors.push('vehicle_id must be a positive integer.');
  }

  if (!start_date || !isValidDateString(start_date)) {
    errors.push('start_date must be a valid date in YYYY-MM-DD format.');
  }

  if (!end_date || !isValidDateString(end_date)) {
    errors.push('end_date must be a valid date in YYYY-MM-DD format.');
  }

  if (isValidDateString(start_date) && isValidDateString(end_date)) {
    const startDate = parseDateUTC(start_date);
    const endDate = parseDateUTC(end_date);

    if (endDate.getTime() < startDate.getTime()) {
      errors.push('end_date must be on or after start_date.');
    } else {
      const days = daysInclusive(start_date, end_date);
      if (days > 90) {
        errors.push('Rental duration cannot exceed 90 days.');
      }
    }

    const allowPastDates = process.env.ALLOW_PAST_DATES !== 'false';
    if (!allowPastDates && isDateInPast(start_date)) {
      errors.push('start_date must be today or in the future.');
    }
  }

  if (customer_email !== undefined && !isValidEmail(customer_email)) {
    errors.push('customer_email must be a valid email address.');
  }

  if (customer_name !== undefined && (typeof customer_name !== 'string' || customer_name.trim() === '')) {
    errors.push('customer_name must be a non-empty string.');
  }

  return errors;
}

module.exports = {
  VALID_CATEGORIES,
  VALID_VEHICLE_STATUSES,
  VALID_RENTAL_STATUSES,
  isValidEmail,
  isValidId,
  validateRegistration,
  validateLogin,
  validateVehicleCreate,
  validateVehicleUpdate,
  validateRentalCreate,
};
