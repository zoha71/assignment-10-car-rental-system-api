const { supabaseAdmin } = require('../config/supabase');
const {
  isValidId,
  validateRentalCreate,
  VALID_RENTAL_STATUSES,
} = require('../utils/validators');
const {
  daysInclusive,
  calculateTotalCost,
  isDateInPast,
} = require('../utils/dateHelper');

/**
 * Format rental record ensuring numeric values
 */
function formatRental(rental) {
  if (!rental) return rental;
  const formatted = {
    ...rental,
    id: Number(rental.id),
    vehicle_id: Number(rental.vehicle_id),
    total_cost: Number(rental.total_cost),
  };

  if (rental.vehicles) {
    formatted.vehicle = {
      ...rental.vehicles,
      id: Number(rental.vehicles.id),
      year: Number(rental.vehicles.year),
      daily_rate: Number(rental.vehicles.daily_rate),
      seating_capacity: Number(rental.vehicles.seating_capacity),
    };
    delete formatted.vehicles;
  }

  return formatted;
}

/**
 * Book a vehicle
 * POST /api/rentals (Auth required)
 */
async function bookRental(req, res, next) {
  try {
    const errors = validateRentalCreate(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
      });
    }

    const { vehicle_id, start_date, end_date } = req.body;
    const customerName = req.body.customer_name?.trim() || req.user.name || 'Customer';
    const customerEmail = req.body.customer_email?.trim() || req.user.email;
    const userId = req.user.id;

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // 1. Fetch vehicle details to verify existence, maintenance state, and daily rate
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', Number(vehicle_id))
      .maybeSingle();

    if (vehicleError) return next(vehicleError);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${vehicle_id} not found.`,
      });
    }

    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is under maintenance and cannot be booked.',
      });
    }

    // 2. Overlap collision check in JavaScript SDK
    // Algorithm (inclusive date range collision):
    // An existing booking conflicts with a new request IF AND ONLY IF:
    //   existing.start_date <= new.end_date AND existing.end_date >= new.start_date
    // Only reservations with status 'booked' or 'active' block future bookings.
    const { data: conflictingRentals, error: conflictError } = await supabaseAdmin
      .from('rentals')
      .select('id, start_date, end_date, status')
      .eq('vehicle_id', Number(vehicle_id))
      .in('status', ['booked', 'active'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (conflictError) return next(conflictError);

    if (conflictingRentals && conflictingRentals.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle already reserved during this timeframe.',
        conflicts: conflictingRentals.map((c) => ({
          rental_id: Number(c.id),
          start_date: c.start_date,
          end_date: c.end_date,
          status: c.status,
        })),
      });
    }

    // 3. Automated day count and dynamic billing calculation
    // Days are counted inclusively: (end - start) + 1
    const totalDays = daysInclusive(start_date, end_date);
    const dailyRate = Number(vehicle.daily_rate);
    const totalCost = calculateTotalCost(totalDays, dailyRate);

    // 4. Insert rental record into PostgreSQL
    const { data: newRental, error: insertError } = await supabaseAdmin
      .from('rentals')
      .insert([
        {
          user_id: userId,
          vehicle_id: Number(vehicle_id),
          customer_name: customerName,
          customer_email: customerEmail,
          start_date,
          end_date,
          total_cost: totalCost,
          status: 'booked',
        },
      ])
      .select()
      .single();

    if (insertError) {
      // Catch Postgres exclusion constraint error (23P01) if simultaneous race condition occurred
      if (insertError.code === '23P01') {
        return res.status(400).json({
          success: false,
          message: 'Vehicle already reserved during this timeframe.',
        });
      }
      return next(insertError);
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle booked successfully.',
      rental: {
        ...formatRental(newRental),
        totalDays,
        daily_rate: dailyRate,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List rentals for authenticated user
 * GET /api/rentals/my-bookings (Auth required)
 */
async function getMyBookings(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    if (status && !VALID_RENTAL_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status filter '${status}'. Allowed: ${VALID_RENTAL_STATUSES.join(', ')}.`,
      });
    }

    let query = supabaseAdmin
      .from('rentals')
      .select('*, vehicles(id, brand, model, year, category, daily_rate, fuel_type, seating_capacity)')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: rentals, error } = await query;

    if (error) return next(error);

    const formattedRentals = (rentals || []).map(formatRental);

    res.status(200).json({
      success: true,
      count: formattedRentals.length,
      rentals: formattedRentals,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel upcoming rental
 * PATCH /api/rentals/:id/cancel (Auth required)
 */
async function cancelRental(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rental ID. ID must be a positive integer.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Fetch rental
    const { data: rental, error: fetchError } = await supabaseAdmin
      .from('rentals')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchError) return next(fetchError);
    if (!rental) {
      return res.status(404).json({
        success: false,
        message: `Rental with ID ${id} not found.`,
      });
    }

    // Authorization: owner or admin
    if (rental.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only cancel your own rentals.',
      });
    }

    // State rule: only booked rentals can be cancelled
    if (rental.status !== 'booked') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel this rental: current status is '${rental.status}'. Only 'booked' rentals can be cancelled.`,
      });
    }

    // Check if start date is in past (if ALLOW_PAST_DATES is false)
    const allowPastDates = process.env.ALLOW_PAST_DATES !== 'false';
    if (!allowPastDates && isDateInPast(rental.start_date)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this rental: start date has already passed.',
      });
    }

    // Update rental status to cancelled
    const { data: updatedRental, error: updateError } = await supabaseAdmin
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', Number(id))
      .select()
      .single();

    if (updateError) return next(updateError);

    res.status(200).json({
      success: true,
      message: 'Rental cancelled successfully.',
      rental: formatRental(updatedRental),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark rental as picked up (active) and vehicle as rented
 * PATCH /api/rentals/:id/pickup (Auth required)
 */
async function pickupRental(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rental ID. ID must be a positive integer.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Fetch rental
    const { data: rental, error: fetchError } = await supabaseAdmin
      .from('rentals')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchError) return next(fetchError);
    if (!rental) {
      return res.status(404).json({
        success: false,
        message: `Rental with ID ${id} not found.`,
      });
    }

    // Authorization: owner or admin
    if (rental.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only manage your own rentals.',
      });
    }

    // State rule: only booked -> active
    if (rental.status !== 'booked') {
      return res.status(400).json({
        success: false,
        message: `Cannot pick up rental: current status is '${rental.status}'. Only 'booked' rentals can be picked up.`,
      });
    }

    // Check vehicle status
    const { data: vehicle, error: vehicleErr } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', Number(rental.vehicle_id))
      .single();

    if (vehicleErr) return next(vehicleErr);

    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is currently under maintenance and cannot be picked up.',
      });
    }

    if (vehicle.status === 'rented') {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is already marked as rented by an active reservation.',
      });
    }

    // Update rental status to active
    const { data: updatedRental, error: updateRentalErr } = await supabaseAdmin
      .from('rentals')
      .update({ status: 'active' })
      .eq('id', Number(id))
      .select()
      .single();

    if (updateRentalErr) return next(updateRentalErr);

    // Update vehicle status to rented
    const { data: updatedVehicle, error: updateVehicleErr } = await supabaseAdmin
      .from('vehicles')
      .update({ status: 'rented' })
      .eq('id', Number(rental.vehicle_id))
      .select()
      .single();

    if (updateVehicleErr) return next(updateVehicleErr);

    res.status(200).json({
      success: true,
      message: 'Rental marked as active and vehicle set to rented.',
      rental: formatRental(updatedRental),
      vehicle_status: updatedVehicle.status,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark rental as completed and vehicle back to available
 * PATCH /api/rentals/:id/complete (Auth required)
 */
async function completeRental(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rental ID. ID must be a positive integer.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Fetch rental
    const { data: rental, error: fetchError } = await supabaseAdmin
      .from('rentals')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchError) return next(fetchError);
    if (!rental) {
      return res.status(404).json({
        success: false,
        message: `Rental with ID ${id} not found.`,
      });
    }

    // Authorization: owner or admin
    if (rental.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only complete your own rentals.',
      });
    }

    // State rule: allowed from booked or active -> completed
    if (rental.status === 'completed' || rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete rental: current status is '${rental.status}'.`,
      });
    }

    // Update rental status to completed
    const { data: updatedRental, error: updateRentalErr } = await supabaseAdmin
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', Number(id))
      .select()
      .single();

    if (updateRentalErr) return next(updateRentalErr);

    // Check if vehicle has any OTHER active rental
    const { data: otherActiveRentals, error: otherActiveErr } = await supabaseAdmin
      .from('rentals')
      .select('id')
      .eq('vehicle_id', Number(rental.vehicle_id))
      .eq('status', 'active');

    if (otherActiveErr) return next(otherActiveErr);

    // Fetch current vehicle status
    const { data: vehicle, error: vehicleErr } = await supabaseAdmin
      .from('vehicles')
      .select('status')
      .eq('id', Number(rental.vehicle_id))
      .single();

    if (vehicleErr) return next(vehicleErr);

    let finalVehicleStatus = vehicle.status;

    // If no other active rentals and vehicle is not in maintenance, set vehicle to available
    if ((!otherActiveRentals || otherActiveRentals.length === 0) && vehicle.status !== 'maintenance') {
      const { data: updatedVehicle, error: updateVehicleErr } = await supabaseAdmin
        .from('vehicles')
        .update({ status: 'available' })
        .eq('id', Number(rental.vehicle_id))
        .select()
        .single();

      if (updateVehicleErr) return next(updateVehicleErr);
      finalVehicleStatus = updatedVehicle.status;
    }

    res.status(200).json({
      success: true,
      message: 'Rental marked as completed and vehicle availability updated.',
      rental: formatRental(updatedRental),
      vehicle_status: finalVehicleStatus,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bookRental,
  getMyBookings,
  cancelRental,
  pickupRental,
  completeRental,
};
