const { supabaseAdmin } = require('../config/supabase');
const {
  VALID_CATEGORIES,
  VALID_VEHICLE_STATUSES,
  isValidId,
  validateVehicleCreate,
  validateVehicleUpdate,
} = require('../utils/validators');
const { isValidDateString, parseDateUTC, daysInclusive } = require('../utils/dateHelper');

/**
 * Format vehicle database record ensuring numeric types
 */
function formatVehicle(v) {
  if (!v) return v;
  return {
    ...v,
    id: Number(v.id),
    year: Number(v.year),
    daily_rate: Number(v.daily_rate),
    seating_capacity: Number(v.seating_capacity),
  };
}

/**
 * Fetch all vehicles with flexible filters & date window availability
 * GET /api/vehicles
 */
async function getAllVehicles(req, res, next) {
  try {
    const {
      category,
      status,
      brand,
      fuel_type,
      minRate,
      maxRate,
      minSeats,
      sort = 'newest',
      available_from,
      available_to,
    } = req.query;

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Validate category filter if provided
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category filter '${category}'. Allowed: ${VALID_CATEGORIES.join(', ')}.`,
      });
    }

    // Validate status filter if provided
    if (status && !VALID_VEHICLE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status filter '${status}'. Allowed: ${VALID_VEHICLE_STATUSES.join(', ')}.`,
      });
    }

    // Validate date window availability filters
    let conflictingVehicleIds = [];
    const hasFrom = Boolean(available_from);
    const hasTo = Boolean(available_to);

    if (hasFrom !== hasTo) {
      return res.status(400).json({
        success: false,
        message: 'Both available_from and available_to must be provided together in YYYY-MM-DD format.',
      });
    }

    if (hasFrom && hasTo) {
      if (!isValidDateString(available_from) || !isValidDateString(available_to)) {
        return res.status(400).json({
          success: false,
          message: 'available_from and available_to must be valid YYYY-MM-DD calendar dates.',
        });
      }

      const fromDate = parseDateUTC(available_from);
      const toDate = parseDateUTC(available_to);
      if (toDate.getTime() < fromDate.getTime()) {
        return res.status(400).json({
          success: false,
          message: 'available_to must be on or after available_from.',
        });
      }

      // Query rentals table for conflicting booked/active reservations in this window
      // Overlap condition: start_date <= available_to AND end_date >= available_from
      const { data: overlappingRentals, error: overlapError } = await supabaseAdmin
        .from('rentals')
        .select('vehicle_id')
        .in('status', ['booked', 'active'])
        .lte('start_date', available_to)
        .gte('end_date', available_from);

      if (overlapError) {
        return next(overlapError);
      }

      conflictingVehicleIds = (overlappingRentals || []).map((r) => Number(r.vehicle_id));
    }

    // Build vehicle query
    let query = supabaseAdmin.from('vehicles').select('*');

    if (category) {
      query = query.eq('category', category);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (brand) {
      query = query.ilike('brand', `%${brand.trim()}%`);
    }

    if (fuel_type) {
      query = query.ilike('fuel_type', `%${fuel_type.trim()}%`);
    }

    if (minRate) {
      const parsedMin = Number(minRate);
      if (!isNaN(parsedMin)) {
        query = query.gte('daily_rate', parsedMin);
      }
    }

    if (maxRate) {
      const parsedMax = Number(maxRate);
      if (!isNaN(parsedMax)) {
        query = query.lte('daily_rate', parsedMax);
      }
    }

    if (minSeats) {
      const parsedSeats = Number(minSeats);
      if (!isNaN(parsedSeats)) {
        query = query.gte('seating_capacity', parsedSeats);
      }
    }

    // Sorting
    if (sort === 'rate_asc') {
      query = query.order('daily_rate', { ascending: true });
    } else if (sort === 'rate_desc') {
      query = query.order('daily_rate', { ascending: false });
    } else {
      // Default: newest
      query = query.order('created_at', { ascending: false });
    }

    const { data: vehicles, error } = await query;
    if (error) {
      return next(error);
    }

    let filteredVehicles = (vehicles || []).map(formatVehicle);

    // If date availability filter was used, filter out maintenance vehicles and conflicting vehicle IDs
    if (hasFrom && hasTo) {
      filteredVehicles = filteredVehicles.filter(
        (v) => v.status !== 'maintenance' && !conflictingVehicleIds.includes(v.id)
      );
    }

    res.status(200).json({
      success: true,
      count: filteredVehicles.length,
      vehicles: filteredVehicles,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get vehicle details with past rental records & upcoming booked periods
 * GET /api/vehicles/:id (Public, no customer PII exposed)
 */
async function getVehicleById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle ID. ID must be a positive integer.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Fetch vehicle with relational join on rentals
    const { data: vehicle, error } = await supabaseAdmin
      .from('vehicles')
      .select('*, rentals(id, start_date, end_date, status, total_cost, created_at)')
      .eq('id', Number(id))
      .maybeSingle();

    if (error) {
      return next(error);
    }

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found.`,
      });
    }

    const allRentals = vehicle.rentals || [];

    // Filter past / completed / cancelled rentals (safe for public view, newest first)
    const pastRentals = allRentals
      .filter((r) => r.status === 'completed' || r.status === 'cancelled')
      .map((r) => ({
        id: Number(r.id),
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
        total_cost: Number(r.total_cost),
      }))
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    // Filter upcoming / active booked periods (only dates, no PII)
    const upcomingBookedPeriods = allRentals
      .filter((r) => r.status === 'booked' || r.status === 'active')
      .map((r) => ({
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
      }))
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

    const formattedVehicle = formatVehicle(vehicle);
    delete formattedVehicle.rentals;

    res.status(200).json({
      success: true,
      vehicle: {
        ...formattedVehicle,
        pastRentals,
        upcomingBookedPeriods,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add new vehicle to fleet (Admin only)
 * POST /api/vehicles
 */
async function createVehicle(req, res, next) {
  try {
    const errors = validateVehicleCreate(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
      });
    }

    const {
      brand,
      model,
      year,
      category,
      daily_rate,
      fuel_type,
      seating_capacity = 5,
      status = 'available',
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    const { data: newVehicle, error } = await supabaseAdmin
      .from('vehicles')
      .insert([
        {
          brand: brand.trim(),
          model: model.trim(),
          year: Number(year),
          category,
          daily_rate: Number(daily_rate),
          fuel_type: fuel_type.trim(),
          seating_capacity: Number(seating_capacity),
          status,
        },
      ])
      .select()
      .single();

    if (error) {
      return next(error);
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully.',
      vehicle: formatVehicle(newVehicle),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update vehicle details or status (Admin only)
 * PUT /api/vehicles/:id
 */
async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle ID. ID must be a positive integer.',
      });
    }

    const errors = validateVehicleUpdate(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Check if vehicle exists
    const { data: existingVehicle, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchError) return next(fetchError);
    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found.`,
      });
    }

    // State transition rules:
    // 1. Cannot manually set status to 'rented' (system-managed upon customer pickup)
    if (req.body.status === 'rented') {
      return res.status(400).json({
        success: false,
        message: "Status 'rented' is system-managed and cannot be set manually.",
      });
    }

    // 2. If changing status to maintenance/available, check if vehicle currently has an active rental
    if (req.body.status && req.body.status !== existingVehicle.status) {
      const { data: activeRentals, error: activeErr } = await supabaseAdmin
        .from('rentals')
        .select('id')
        .eq('vehicle_id', Number(id))
        .eq('status', 'active');

      if (activeErr) return next(activeErr);

      if (activeRentals && activeRentals.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle is currently rented.',
        });
      }
    }

    // Build update payload
    const updateData = {};
    if (req.body.brand !== undefined) updateData.brand = req.body.brand.trim();
    if (req.body.model !== undefined) updateData.model = req.body.model.trim();
    if (req.body.year !== undefined) updateData.year = Number(req.body.year);
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.daily_rate !== undefined) updateData.daily_rate = Number(req.body.daily_rate);
    if (req.body.fuel_type !== undefined) updateData.fuel_type = req.body.fuel_type.trim();
    if (req.body.seating_capacity !== undefined) updateData.seating_capacity = Number(req.body.seating_capacity);
    if (req.body.status !== undefined) updateData.status = req.body.status;

    const { data: updatedVehicle, error: updateError } = await supabaseAdmin
      .from('vehicles')
      .update(updateData)
      .eq('id', Number(id))
      .select()
      .single();

    if (updateError) {
      return next(updateError);
    }

    res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully.',
      vehicle: formatVehicle(updatedVehicle),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete vehicle from fleet (Admin only)
 * DELETE /api/vehicles/:id
 */
async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle ID. ID must be a positive integer.',
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        message: 'Supabase server configuration is missing. Please check .env setup.',
      });
    }

    // Check if vehicle exists
    const { data: existingVehicle, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('id')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchError) return next(fetchError);
    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found.`,
      });
    }

    // Check if vehicle has any booked or active rentals
    const { data: activeBookings, error: checkError } = await supabaseAdmin
      .from('rentals')
      .select('id, status')
      .eq('vehicle_id', Number(id))
      .in('status', ['booked', 'active']);

    if (checkError) return next(checkError);

    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle has active bookings.',
      });
    }

    // Attempt deletion
    const { error: deleteError } = await supabaseAdmin
      .from('vehicles')
      .delete()
      .eq('id', Number(id));

    if (deleteError) {
      // Catch foreign key violation (ON DELETE RESTRICT with past completed/cancelled rentals)
      if (deleteError.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'Vehicle has rental history and cannot be deleted; set its status to maintenance instead.',
        });
      }
      return next(deleteError);
    }

    res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};
