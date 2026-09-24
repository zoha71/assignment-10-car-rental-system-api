#!/usr/bin/env node
require('dotenv').config();
const http = require('http');
const app = require('../server');
const { checkEnv, supabaseAdmin, createAuthClient } = require('../config/supabase');
const { formatDateUTC } = require('../utils/dateHelper');

let serverInstance;
let BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
let passed = 0;
let failed = 0;

const cleanupData = {
  rentalIds: [],
  vehicleIds: [],
  userIds: [],
};

function logStep(name, success, detail = '') {
  if (success) {
    passed++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name} ${detail ? `(${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✖ FAIL\x1b[0m: ${name} ${detail ? `\n    Error: ${detail}` : ''}`);
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOptions);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSmokeTests() {
  console.log('\n=============================================================');
  console.log('🚗 Starting Car Rental & Fleet API Comprehensive Smoke Tests');
  console.log('=============================================================\n');

  // 1. Check Supabase Environment Setup
  const envStatus = checkEnv();
  if (!envStatus.valid) {
    console.log(`\x1b[33m[Supabase Config Missing]\x1b[0m`);
    console.log(`${envStatus.errorMsg}\n`);
    console.log('To run live smoke tests:');
    console.log('1. Set up a Supabase project at https://supabase.com');
    console.log('2. Execute database/schema.sql and database/seed.sql in the Supabase SQL Editor');
    console.log('3. Fill in SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Kartik_Wagh/.env');
    console.log('4. Run: npm run test:smoke\n');
    process.exit(0);
  }

  // 2. Start Test Server on available port
  const TEST_PORT = 5055;
  BASE_URL = `http://localhost:${TEST_PORT}`;
  await new Promise((resolve) => {
    serverInstance = app.listen(TEST_PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  try {
    // 3. Verify Database Connectivity & Seed State
    console.log('📋 [Section 1: Database & Seed Health Check]');
    const { data: seedVehicles, error: seedError } = await supabaseAdmin.from('vehicles').select('*');
    if (seedError) {
      if (seedError.message.includes('relation "vehicles" does not exist') || seedError.code === '42P01') {
        console.log('\x1b[31m✖ ERROR: Database tables do not exist in Supabase!\x1b[0m');
        console.log('Please execute \x1b[36mdatabase/schema.sql\x1b[0m followed by \x1b[36mdatabase/seed.sql\x1b[0m in your Supabase SQL Editor.');
        process.exit(1);
      }
      throw seedError;
    }

    logStep('Database connection established', true);
    logStep('Vehicles table queryable', seedVehicles && seedVehicles.length > 0, `Found ${seedVehicles?.length || 0} vehicles`);

    // Target vehicle #1
    let vehicle1 = seedVehicles.find((v) => Number(v.id) === 1) || seedVehicles[0];
    let vehicle1Id = vehicle1.id;
    let vehicle1Rate = Number(vehicle1.daily_rate);

    // 4. Test Health & Info Endpoints
    console.log('\n📋 [Section 2: System Health & Info Endpoints]');
    const healthRes = await request('/health');
    logStep('GET /health returns 200 OK', healthRes.status === 200 && healthRes.data?.status === 'ok');

    const rootRes = await request('/');
    logStep('GET / returns 200 API Info', rootRes.status === 200 && rootRes.data?.success === true);

    // 5. User Registration, Authentication & Profiles
    console.log('\n📋 [Section 3: Authentication & Authorization]');
    const timestamp = Date.now();
    const testCustomer = {
      name: `Test Driver ${timestamp}`,
      email: `testdriver_${timestamp}@smoke-test.com`,
      password: 'StrongPassword123!',
    };

    const testCustomer2 = {
      name: `Second Driver ${timestamp}`,
      email: `driver2_${timestamp}@smoke-test.com`,
      password: 'StrongPassword123!',
    };

    const testAdmin = {
      name: `Test Admin ${timestamp}`,
      email: `testadmin_${timestamp}@smoke-test.com`,
      password: 'AdminPassword123!',
    };

    // 5.1 Registration
    const regRes = await request('/api/auth/register', { method: 'POST', body: testCustomer });
    logStep('POST /api/auth/register returns 201 Created with tokens', regRes.status === 201 && Boolean(regRes.data?.access_token));
    const customerToken = regRes.data?.access_token;
    const customerId = regRes.data?.user?.id;
    if (customerId) cleanupData.userIds.push(customerId);

    // 5.2 Duplicate Registration
    const dupRes = await request('/api/auth/register', { method: 'POST', body: testCustomer });
    logStep('POST /api/auth/register with duplicate email returns 400', dupRes.status === 400);

    // 5.3 Invalid Registration
    const badReg = await request('/api/auth/register', { method: 'POST', body: { email: 'bad-email', password: '123' } });
    logStep('POST /api/auth/register with invalid data returns 400', badReg.status === 400);

    // Register second customer
    const reg2Res = await request('/api/auth/register', { method: 'POST', body: testCustomer2 });
    const customer2Token = reg2Res.data?.access_token;
    const customer2Id = reg2Res.data?.user?.id;
    if (customer2Id) cleanupData.userIds.push(customer2Id);

    // 5.4 Login
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testCustomer.email, password: testCustomer.password },
    });
    logStep('POST /api/auth/login returns 200 OK', loginRes.status === 200 && Boolean(loginRes.data?.access_token));

    const badLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testCustomer.email, password: 'WrongPassword!' },
    });
    logStep('POST /api/auth/login with wrong password returns 401', badLoginRes.status === 401);

    // 5.5 Create Admin User directly via Admin API for tests
    const { data: adminCreated, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: testAdmin.email,
      password: testAdmin.password,
      email_confirm: true,
      user_metadata: { name: testAdmin.name },
      app_metadata: { role: 'admin' },
    });
    if (adminErr) throw adminErr;
    cleanupData.userIds.push(adminCreated.user.id);

    const adminAuthClient = createAuthClient();
    const { data: adminSession } = await adminAuthClient.auth.signInWithPassword({
      email: testAdmin.email,
      password: testAdmin.password,
    });
    const adminToken = adminSession.session.access_token;

    // 5.6 GET /api/auth/me
    const meRes = await request('/api/auth/me', { headers: { Authorization: `Bearer ${customerToken}` } });
    logStep('GET /api/auth/me returns customer profile', meRes.status === 200 && meRes.data?.user?.role === 'customer');

    const meAdminRes = await request('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
    logStep('GET /api/auth/me returns admin profile', meAdminRes.status === 200 && meAdminRes.data?.user?.role === 'admin');

    const meNoTokenRes = await request('/api/auth/me');
    logStep('GET /api/auth/me without token returns 401', meNoTokenRes.status === 401);

    const meBadTokenRes = await request('/api/auth/me', { headers: { Authorization: 'Bearer invalid_garbage_token' } });
    logStep('GET /api/auth/me with invalid token returns 401', meBadTokenRes.status === 401);

    // 6. Fleet Management & Route Guards
    console.log('\n📋 [Section 4: Vehicle Fleet Management & Guards]');
    // 6.1 Customer forbidden from creating vehicle
    const custCreateVeh = await request('/api/vehicles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { brand: 'Audi', model: 'A6', year: 2024, category: 'Luxury', daily_rate: 7000, fuel_type: 'Petrol' },
    });
    logStep('POST /api/vehicles with customer token returns 403 Forbidden', custCreateVeh.status === 403);

    // 6.2 Admin creates vehicle (Tesla Model 3 example)
    const adminCreateVeh = await request('/api/vehicles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        brand: 'Tesla',
        model: `Model 3 Test ${timestamp}`,
        year: 2024,
        category: 'Electric',
        daily_rate: 4500,
        fuel_type: 'EV',
        seating_capacity: 5,
        status: 'available',
      },
    });
    logStep('POST /api/vehicles with admin token returns 201 Created', adminCreateVeh.status === 201);
    const createdVehicleId = adminCreateVeh.data?.vehicle?.id;
    if (createdVehicleId) cleanupData.vehicleIds.push(createdVehicleId);

    // 6.3 Vehicle creation validation failure
    const badVehRes = await request('/api/vehicles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { brand: 'Tesla', model: 'Model Y', year: 1950, category: 'InvalidCategory', daily_rate: -100 },
    });
    logStep('POST /api/vehicles with invalid payload returns 400 Bad Request', badVehRes.status === 400);

    // 6.4 Vehicle listing & filters
    const listAll = await request('/api/vehicles');
    logStep('GET /api/vehicles returns 200 with vehicle list', listAll.status === 200 && Array.isArray(listAll.data?.vehicles));

    const listFilter = await request('/api/vehicles?category=Electric&sort=rate_asc');
    logStep('GET /api/vehicles with category & sort filters returns 200', listFilter.status === 200 && listFilter.data.vehicles.every((v) => v.category === 'Electric'));

    // 6.5 Vehicle details with relational join
    const vehDetails = await request(`/api/vehicles/${vehicle1Id}`);
    logStep(
      'GET /api/vehicles/:id returns vehicle + past rentals & upcoming periods (no customer PII)',
      vehDetails.status === 200 &&
        vehDetails.data?.vehicle?.id === Number(vehicle1Id) &&
        Array.isArray(vehDetails.data?.vehicle?.pastRentals) &&
        Array.isArray(vehDetails.data?.vehicle?.upcomingBookedPeriods) &&
        !vehDetails.data?.vehicle?.customer_name
    );

    const vehBadId = await request('/api/vehicles/not-a-number');
    logStep('GET /api/vehicles/:invalidId returns 400 Bad Request', vehBadId.status === 400);

    const veh404 = await request('/api/vehicles/99999999');
    logStep('GET /api/vehicles/99999999 returns 404 Not Found', veh404.status === 404);

    // 7. Assignment Core Booking & Date Collision Logic
    console.log('\n📋 [Section 5: Assignment Booking & Collision Prevention Scenarios]');

    // 7.1 Assignment Example: Book Vehicle #1 for 2026-05-01 -> 2026-05-05
    const assignBook1 = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        vehicle_id: vehicle1Id,
        start_date: '2026-05-01',
        end_date: '2026-05-05',
        customer_name: 'David',
        customer_email: 'david@test.com',
      },
    });

    const expectedCost1 = Number((5 * vehicle1Rate).toFixed(2));
    const isAssignBook1Ok =
      assignBook1.status === 201 &&
      assignBook1.data?.rental?.totalDays === 5 &&
      assignBook1.data?.rental?.total_cost === expectedCost1;
    logStep(
      'POST /api/rentals: Book Vehicle #1 (2026-05-01 to 2026-05-05) -> 201 (5 days, correct cost)',
      isAssignBook1Ok,
      `Days: ${assignBook1.data?.rental?.totalDays}, Cost: ${assignBook1.data?.rental?.total_cost}`
    );
    if (assignBook1.data?.rental?.id) cleanupData.rentalIds.push(assignBook1.data.rental.id);

    // 7.2 Assignment Collision: Overlapping Booking 2026-05-03 -> 2026-05-07
    const assignBook2 = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        vehicle_id: vehicle1Id,
        start_date: '2026-05-03',
        end_date: '2026-05-07',
        customer_name: 'David',
        customer_email: 'david@test.com',
      },
    });
    logStep(
      'POST /api/rentals: Overlapping booking (2026-05-03 to 2026-05-07) returns 400 Collision',
      assignBook2.status === 400 && assignBook2.data?.message?.includes('already reserved')
    );

    // 8. Advanced Collision & Billing Scenarios (Dynamic Future Dates)
    console.log('\n📋 [Section 6: Advanced Collision & Date Logic Matrix]');
    const now = new Date();
    const futureDate = (offsetDays) => {
      const d = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate() + offsetDays));
      return formatDateUTC(d);
    };

    const d10 = futureDate(10);
    const d15 = futureDate(15);
    const d20 = futureDate(20);
    const d25 = futureDate(25);

    // Target dedicated vehicle for clean matrix tests
    const matrixVehicle = createdVehicleId;
    const matrixVehRate = 4500;

    // 8.1 Base Booking: Day 10 to Day 20 (11 days inclusive)
    const baseRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        vehicle_id: matrixVehicle,
        start_date: d10,
        end_date: d20,
      },
    });
    logStep(
      `Base reservation (${d10} to ${d20}) returns 201 Created (11 days)`,
      baseRes.status === 201 && baseRes.data?.rental?.totalDays === 11 && baseRes.data?.rental?.total_cost === 11 * matrixVehRate
    );
    if (baseRes.data?.rental?.id) cleanupData.rentalIds.push(baseRes.data.rental.id);

    // 8.2 Sub-range conflict: Fully Inside (Day 12 to Day 15)
    const insideRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(12), end_date: futureDate(15) },
    });
    logStep('Fully inside existing range -> 400 Collision', insideRes.status === 400);

    // 8.3 Super-range conflict: Fully Containing (Day 8 to Day 22)
    const containingRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(8), end_date: futureDate(22) },
    });
    logStep('Fully containing existing range -> 400 Collision', containingRes.status === 400);

    // 8.4 Boundary Collision: Sharing start day (Day 5 to Day 10)
    const boundaryStartRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(5), end_date: d10 },
    });
    logStep('Sharing boundary start day -> 400 Collision', boundaryStartRes.status === 400);

    // 8.5 Boundary Collision: Sharing end day (Day 20 to Day 25)
    const boundaryEndRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: d20, end_date: d25 },
    });
    logStep('Sharing boundary end day -> 400 Collision', boundaryEndRes.status === 400);

    // 8.6 Non-overlapping Adjacent Booking: Starts Day 21 (Day after base end)
    const adjacentRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(21), end_date: futureDate(25) },
    });
    logStep('Adjacent non-overlapping booking (starts day after) -> 201 Created', adjacentRes.status === 201);
    if (adjacentRes.data?.rental?.id) cleanupData.rentalIds.push(adjacentRes.data.rental.id);

    // 8.7 Same dates on a different vehicle
    const diffVehRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: vehicle1Id, start_date: d10, end_date: d20 },
    });
    logStep('Same dates on a different vehicle -> 201 Created', diffVehRes.status === 201);
    if (diffVehRes.data?.rental?.id) cleanupData.rentalIds.push(diffVehRes.data.rental.id);

    // 8.8 Same-day (1 day) booking billing test
    const sameDayRes = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(30), end_date: futureDate(30) },
    });
    logStep(
      'Same-day (1 day) booking bills exactly 1 day (totalDays: 1, total_cost: daily_rate)',
      sameDayRes.status === 201 && sameDayRes.data?.rental?.totalDays === 1 && sameDayRes.data?.rental?.total_cost === matrixVehRate
    );
    if (sameDayRes.data?.rental?.id) cleanupData.rentalIds.push(sameDayRes.data.rental.id);

    // 8.9 Date Availability Query Filter
    const availWindowRes = await request(`/api/vehicles?available_from=${d10}&available_to=${d20}`);
    const availVehicles = availWindowRes.data?.vehicles || [];
    const matrixInAvail = availVehicles.some((v) => v.id === Number(matrixVehicle));
    logStep(
      'GET /api/vehicles?available_from&available_to excludes booked and maintenance vehicles',
      availWindowRes.status === 200 && !matrixInAvail
    );

    // 8.10 Concurrency: Simultaneous identical booking requests
    console.log('\n📋 [Section 7: Concurrency & Race Condition Safety]');
    const concDateStart = futureDate(50);
    const concDateEnd = futureDate(55);
    const [cRes1, cRes2] = await Promise.all([
      request('/api/rentals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { vehicle_id: matrixVehicle, start_date: concDateStart, end_date: concDateEnd },
      }),
      request('/api/rentals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customer2Token}` },
        body: { vehicle_id: matrixVehicle, start_date: concDateStart, end_date: concDateEnd },
      }),
    ]);

    const statuses = [cRes1.status, cRes2.status].sort();
    logStep(
      'Concurrent identical bookings: exactly one 201 Created and one 400 Collision',
      statuses[0] === 201 && statuses[1] === 400
    );
    if (cRes1.data?.rental?.id) cleanupData.rentalIds.push(cRes1.data.rental.id);
    if (cRes2.data?.rental?.id) cleanupData.rentalIds.push(cRes2.data.rental.id);

    // 8.11 Edge Validations
    console.log('\n📋 [Section 8: Input Validations & Error Guards]');
    const reversedDates = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: '2026-06-10', end_date: '2026-06-05' },
    });
    logStep('end_date < start_date returns 400 Bad Request', reversedDates.status === 400);

    const badCalendarDate = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: '2026-02-30', end_date: '2026-03-05' },
    });
    logStep('Invalid calendar date (2026-02-30) returns 400 Bad Request', badCalendarDate.status === 400);

    const excessiveDays = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: '2026-01-01', end_date: '2026-06-01' },
    });
    logStep('Rental duration > 90 days returns 400 Bad Request', excessiveDays.status === 400);

    // 9. Booking Lifecycle, State Machine & Authorization Guards
    console.log('\n📋 [Section 9: Rental Lifecycle & Fleet State Transitions]');
    // 9.1 My Bookings
    const myBookingsRes = await request('/api/rentals/my-bookings', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep(
      'GET /api/rentals/my-bookings returns caller bookings joined with vehicle data',
      myBookingsRes.status === 200 && Array.isArray(myBookingsRes.data?.rentals) && myBookingsRes.data.rentals.length > 0
    );

    // Create dedicated rental for lifecycle
    const lifeBooking = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(70), end_date: futureDate(75) },
    });
    const lifeRentalId = lifeBooking.data?.rental?.id;
    if (lifeRentalId) cleanupData.rentalIds.push(lifeRentalId);

    // 9.2 Unauthorized management (Customer 2 trying to manage Customer 1's rental)
    const unauthCancel = await request(`/api/rentals/${lifeRentalId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customer2Token}` },
    });
    logStep('Unauthorized user cannot cancel another user rental -> 403 Forbidden', unauthCancel.status === 403);

    // 9.3 Cancel workflow
    const cancelRes = await request(`/api/rentals/${lifeRentalId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep('PATCH /api/rentals/:id/cancel returns 200 OK (status: cancelled)', cancelRes.status === 200 && cancelRes.data?.rental?.status === 'cancelled');

    // Re-booking cancelled timeframe is now allowed
    const rebookAfterCancel = await request('/api/rentals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { vehicle_id: matrixVehicle, start_date: futureDate(70), end_date: futureDate(75) },
    });
    logStep('Cancelled rentals do not block re-booking (201 Created)', rebookAfterCancel.status === 201);
    const activeLifecycleId = rebookAfterCancel.data?.rental?.id;
    if (activeLifecycleId) cleanupData.rentalIds.push(activeLifecycleId);

    // Cancelling an already cancelled rental
    const doubleCancel = await request(`/api/rentals/${lifeRentalId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep('Cancelling an already cancelled rental returns 400 Bad Request', doubleCancel.status === 400);

    // 9.4 Pickup workflow (booked -> active)
    const pickupRes = await request(`/api/rentals/${activeLifecycleId}/pickup`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep(
      'PATCH /api/rentals/:id/pickup transitions rental -> active and vehicle -> rented',
      pickupRes.status === 200 &&
        pickupRes.data?.rental?.status === 'active' &&
        pickupRes.data?.vehicle_status === 'rented'
    );

    // Setting vehicle to maintenance while rental is active is blocked
    const maintWhileActive = await request(`/api/vehicles/${matrixVehicle}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'maintenance' },
    });
    logStep('Setting vehicle to maintenance while rented returns 400 Bad Request', maintWhileActive.status === 400);

    // Deleting vehicle with active rental is blocked
    const deleteActiveVeh = await request(`/api/vehicles/${matrixVehicle}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    logStep('DELETE vehicle with active rental returns 400 Bad Request', deleteActiveVeh.status === 400);

    // 9.5 Complete workflow (active -> completed)
    const completeRes = await request(`/api/rentals/${activeLifecycleId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep(
      'PATCH /api/rentals/:id/complete transitions rental -> completed and vehicle -> available',
      completeRes.status === 200 &&
        completeRes.data?.rental?.status === 'completed' &&
        completeRes.data?.vehicle_status === 'available'
    );

    // Completing twice is blocked
    const doubleComplete = await request(`/api/rentals/${activeLifecycleId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    logStep('Completing an already completed rental returns 400 Bad Request', doubleComplete.status === 400);

    // 10. Fleet Deletion & History Guard
    console.log('\n📋 [Section 10: Fleet Updates & Foreign Key Deletion Guards]');
    // Update daily rate
    const updateRateRes = await request(`/api/vehicles/${matrixVehicle}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { daily_rate: 5200 },
    });
    logStep('Admin PUT /api/vehicles/:id updates daily_rate successfully', updateRateRes.status === 200 && updateRateRes.data?.vehicle?.daily_rate === 5200);

    // Try deleting vehicle with completed rental history (FK Restrict constraint)
    const deleteWithHistory = await request(`/api/vehicles/${matrixVehicle}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    logStep(
      'DELETE vehicle with past rental history is restricted by FK constraint (returns 400)',
      deleteWithHistory.status === 400 && deleteWithHistory.data?.message?.includes('rental history')
    );

    // Create and delete a vehicle with NO history
    const tempVeh = await request('/api/vehicles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { brand: 'Temporary', model: 'ToDelete', year: 2024, category: 'Sedan', daily_rate: 2000, fuel_type: 'Petrol' },
    });
    const tempVehId = tempVeh.data?.vehicle?.id;
    const deleteCleanVeh = await request(`/api/vehicles/${tempVehId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    logStep('DELETE vehicle with no rental history returns 200 OK', deleteCleanVeh.status === 200);

  } catch (err) {
    console.error('\n\x1b[31m[Test Suite Error]\x1b[0m', err);
    failed++;
  } finally {
    // 11. Cleanup test resources
    console.log('\n🧹 [Cleanup: Removing Test Artifacts]');
    try {
      if (cleanupData.rentalIds.length > 0) {
        await supabaseAdmin.from('rentals').delete().in('id', cleanupData.rentalIds);
      }
      if (cleanupData.vehicleIds.length > 0) {
        // Also clean up any rentals attached to test vehicles
        await supabaseAdmin.from('rentals').delete().in('vehicle_id', cleanupData.vehicleIds);
        await supabaseAdmin.from('vehicles').delete().in('id', cleanupData.vehicleIds);
      }
      for (const uid of cleanupData.userIds) {
        await supabaseAdmin.auth.admin.deleteUser(uid);
      }
      console.log(`  ✔ Cleaned up test rentals, vehicles, and auth users.`);
    } catch (cleanErr) {
      console.warn('  ⚠️ Warning during cleanup:', cleanErr.message);
    }

    if (serverInstance) {
      serverInstance.close();
    }

    console.log('\n=============================================================');
    console.log(`📊 Smoke Test Summary: \x1b[32m${passed} Passed\x1b[0m, \x1b[31m${failed} Failed\x1b[0m`);
    console.log('=============================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runSmokeTests();
