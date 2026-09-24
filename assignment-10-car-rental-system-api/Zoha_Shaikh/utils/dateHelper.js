/**
 * Date Helper Utilities for Car Rental System
 * Ensures accurate UTC date handling, inclusive day counting, and overlap checking.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates whether a string is a valid YYYY-MM-DD calendar date.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Parses a YYYY-MM-DD string into a UTC Date object at midnight.
 * @param {string} dateStr
 * @returns {Date}
 */
function parseDateUTC(dateStr) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date format: '${dateStr}'. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Calculates the number of days between two dates inclusive.
 * Formula: totalDays = (end_date - start_date in days) + 1
 * E.g., 2026-05-01 to 2026-05-05 = 5 days; same day = 1 day.
 * @param {string} startStr
 * @param {string} endStr
 * @returns {number}
 */
function daysInclusive(startStr, endStr) {
  const startDate = parseDateUTC(startStr);
  const endDate = parseDateUTC(endStr);

  const diffTime = endDate.getTime() - startDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    throw new Error('end_date must be greater than or equal to start_date.');
  }

  return diffDays + 1;
}

/**
 * Calculates total rental cost based on day span and daily rate.
 * @param {number} days
 * @param {number|string} dailyRate
 * @returns {number}
 */
function calculateTotalCost(days, dailyRate) {
  const rate = Number(dailyRate);
  if (isNaN(rate) || rate <= 0) {
    throw new Error('daily_rate must be a positive number.');
  }
  return Number((days * rate).toFixed(2));
}

/**
 * Checks whether two inclusive date ranges overlap.
 * Algorithm: startA <= endB AND endA >= startB
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean}
 */
function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

/**
 * Checks if a date string is in the past compared to current UTC date.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isDateInPast(dateStr) {
  const date = parseDateUTC(dateStr);
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date.getTime() < todayUTC.getTime();
}

/**
 * Formats a Date object to YYYY-MM-DD UTC string.
 * @param {Date} date
 * @returns {string}
 */
function formatDateUTC(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  isValidDateString,
  parseDateUTC,
  daysInclusive,
  calculateTotalCost,
  rangesOverlap,
  isDateInPast,
  formatDateUTC,
};
