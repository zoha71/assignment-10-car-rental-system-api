# 🚗 Car Rental & Vehicle Fleet Management API

[![Node.js Version](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Framework-Express%204-lightgrey.svg)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20%28PostgreSQL%29-3ECF8E.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

A production-ready **Car Rental & Vehicle Fleet Management REST API** built with **Node.js**, **Express.js**, and **Supabase (PostgreSQL & Auth)**. The system enforces strict date-collision prevention algorithms, automated dynamic billing computations, relational joins for vehicle reservation histories, role-based access control, and complete fleet availability state management.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Supabase Setup & Database Migration](#-supabase-setup--database-migration)
- [Local Installation & Quickstart](#-local-installation--quickstart)
- [Environment Configuration](#-environment-configuration)
- [API Endpoints Reference](#-api-endpoints-reference)
- [Business Logic & Mathematical Formulations](#-business-logic--mathematical-formulations)
  - [1. Inclusive Day Span & Billing Calculation](#1-inclusive-day-span--billing-calculation)
  - [2. Inclusive Date Range Collision Prevention Algorithm](#2-inclusive-date-range-collision-prevention-algorithm)
  - [3. PostgreSQL Exclusion Constraint Safety Net](#3-postgresql-exclusion-constraint-safety-net)
  - [4. Fleet & Rental State Machine Transitions](#4-fleet--rental-state-machine-transitions)
- [Authentication & Security Architecture](#-authentication--security-architecture)
- [Postman Collection & Automated Testing](#-postman-collection--automated-testing)
- [Deployment on Render](#-deployment-on-render)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🌟 Overview & Architecture

This API is designed to manage a vehicle fleet and handle high-integrity customer reservations with zero double-booking tolerance. It operates as a secure bridge between client applications and Supabase:

```
┌────────────────────────────────────────────────────────┐
│             Client (Postman / Web / Mobile)            │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON (JWT Bearer)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Node.js / Express Backend Server           │
│  - Helmet & CORS Middleware                            │
│  - Supabase JWT Token Verification (middleware/auth)   │
│  - Business Rules, Date Validation & Billing Engine    │
│  - Centralized Error & Postgres Code Mapping           │
└───────────────────────────┬────────────────────────────┘
                            │ Supabase JS SDK (Service Role Client)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Supabase Cloud (PostgreSQL & Auth)         │
│  - auth.users (Supabase Auth)                          │
│  - vehicles & rentals Relational Tables                │
│  - btree_gist Exclusion Constraint (Race Net)          │
│  - Row Level Security (RLS)                            │
└────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

- 🛡️ **Zero Double-Booking Guarantee**: Two-tier protection via JavaScript interval collision checks and PostgreSQL `btree_gist` exclusion constraints (`no_double_booking`).
- 💰 **Dynamic Server-Side Billing**: Automatic duration counting `(end - start) + 1` and server-computed total price based on verified vehicle rates.
- 🔐 **Supabase JWT Authentication & RBAC**: Customer registration with instant confirmation via Supabase Admin API and role-based route guards (`customer` vs `admin`).
- 🚘 **Fleet Lifecycle State Transitions**: `available` ➔ `rented` (on customer pickup) ➔ `available` (on completion), with maintenance status controls.
- 📊 **Relational Vehicle Histories**: Relational queries joining vehicle records with past rentals while redacting customer PII on public endpoints.
- 🔍 **Multi-Parametric Fleet Filtering**: Filter by category, status, brand, fuel type, seat capacity, price ranges, and real-time date availability windows.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v20+ recommended)
- **Framework**: Express.js 4.x
- **Database & Auth**: Supabase (PostgreSQL 15+ & Supabase GoTrue Auth)
- **Security & Utilities**: Helmet, CORS, Dotenv
- **Testing**: Native Node.js test runner (`fetch` smoke test suite)

---

## 📂 Project Directory Structure

```text
Kartik_Wagh/
├── config/
│   └── supabase.js                # Supabase Admin & Isolated Auth client instances
├── controllers/
│   ├── authController.js          # Registration, login & profile logic
│   ├── rentalController.js        # Reservation, dynamic billing & collision logic
│   └── vehicleController.js       # Fleet CRUD, relational joins & availability filter
├── database/
│   ├── schema.sql                 # PostgreSQL DDL, indexes, btree_gist & RLS policies
│   └── seed.sql                   # 5 realistic seed vehicles (Sedan, SUV, Luxury, Electric)
├── middleware/
│   ├── auth.js                    # JWT Bearer token validator & requireAdmin guard
│   └── errorHandler.js            # Centralized error handler & Postgres code mapper
├── postman/
│   ├── CarRental_API.postman_collection.json   # Comprehensive Postman 2.1 test suite
│   └── CarRental_API.postman_environment.json  # Environment file (Local & Render)
├── routes/
│   ├── authRoutes.js              # Auth endpoints (/api/auth/*)
│   ├── rentalRoutes.js            # Rental endpoints (/api/rentals/*)
│   └── vehicleRoutes.js           # Vehicle endpoints (/api/vehicles/*)
├── scripts/
│   ├── createAdmin.js             # CLI utility for provisioning admin accounts
│   └── smokeTest.js               # Autonomous end-to-end test suite
├── utils/
│   ├── dateHelper.js              # UTC date parser, inclusive counter & collision math
│   └── validators.js              # Strict schema validators
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git ignore rules
├── package.json                   # Project metadata, dependencies & scripts
├── server.js                      # Express server entry point
└── README.md                      # System documentation
```

---

## 🗄️ Supabase Setup & Database Migration

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com/) and create a new project.
   - Choose your database password and select a region.

2. **Execute Database Migrations**:
   - Navigate to **SQL Editor** in your Supabase dashboard.
   - Click **New Query**, copy the complete contents of [`database/schema.sql`](database/schema.sql), and click **Run**.
   - Click **New Query**, copy the contents of [`database/seed.sql`](database/seed.sql), and click **Run**.
   - Navigate to **Table Editor** to confirm the `vehicles` and `rentals` tables are populated.

3. **Obtain API Keys**:
   - Navigate to **Project Settings ➔ API**.
   - Copy **Project URL** (`SUPABASE_URL`).
   - Copy **Project API Key (anon / public)** (`SUPABASE_ANON_KEY`).
   - Copy **Project API Key (service_role / secret)** (`SUPABASE_SERVICE_ROLE_KEY`).

---

## 🚀 Local Installation & Quickstart

```bash
# 1. Navigate to the project root
cd Kartik_Wagh

# 2. Install all dependencies
npm install

# 3. Create your environment file
cp .env.example .env

# 4. Fill in your Supabase credentials in .env
# Edit .env with your favorite editor

# 5. Provision an Admin user
npm run create-admin -- admin@rental.com Admin@123 "Fleet Admin"

# 6. Start the development server
npm run dev
# Or for production:
npm start

# 7. Run autonomous smoke test suite
npm run test:smoke
```

---

## ⚙️ Environment Configuration

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Local HTTP server port | `5000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `SUPABASE_URL` | Supabase Cloud Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anonymous Client Key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Secret Key | `eyJhbGciOi...` |
| `ALLOW_PAST_DATES` | Set `true` to allow assignment sample dates (May 2026) | `true` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |

---

## 📖 API Endpoints Reference

All API responses follow a consistent JSON response shape:
- Success: `{ "success": true, ... }`
- Error: `{ "success": false, "message": "..." }`

### 1. Supabase Authentication

| Method | Endpoint | Auth | Description | Request Body Example | Status Codes |
|---|---|:---:|---|---|---|
| `POST` | `/api/auth/register` | None | Register new customer | `{"email":"driver@travel.com","password":"mypassword123","name":"David"}` | `201`, `400` |
| `POST` | `/api/auth/login` | None | Authenticate & get token | `{"email":"driver@travel.com","password":"mypassword123"}` | `200`, `401` |
| `GET` | `/api/auth/me` | Customer/Admin | Get authenticated profile | None | `200`, `401` |

### 2. Vehicle Fleet Management

| Method | Endpoint | Auth | Description | Query / Request Body | Status Codes |
|---|---|:---:|---|---|---|
| `GET` | `/api/vehicles` | None | List vehicles with filters | `?category=SUV&status=available&sort=rate_asc&available_from=2026-06-01&available_to=2026-06-05` | `200`, `400` |
| `GET` | `/api/vehicles/:id` | None | Get vehicle details + history | None | `200`, `400`, `404` |
| `POST` | `/api/vehicles` | **Admin** | Add vehicle to fleet | `{"brand":"Tesla","model":"Model 3","year":2024,"category":"Electric","daily_rate":4500,"fuel_type":"EV","seating_capacity":5}` | `201`, `400`, `403` |
| `PUT` | `/api/vehicles/:id` | **Admin** | Update rate or status | `{"daily_rate":4800,"status":"available"}` | `200`, `400`, `403`, `404` |
| `DELETE` | `/api/vehicles/:id` | **Admin** | Delete vehicle from fleet | None | `200`, `400`, `403`, `404` |

### 3. Rental & Booking Operations

| Method | Endpoint | Auth | Description | Request Body Example | Status Codes |
|---|---|:---:|---|---|---|
| `POST` | `/api/rentals` | Customer/Admin | Book a vehicle | `{"vehicle_id":1,"start_date":"2026-05-01","end_date":"2026-05-05","customer_name":"David","customer_email":"david@test.com"}` | `201`, `400`, `404` |
| `GET` | `/api/rentals/my-bookings` | Customer/Admin | List user's bookings | `?status=booked` | `200`, `401` |
| `PATCH` | `/api/rentals/:id/cancel` | Owner/Admin | Cancel booked rental | None | `200`, `400`, `403`, `404` |
| `PATCH` | `/api/rentals/:id/pickup` | Owner/Admin | Mark picked up (`rented`) | None | `200`, `400`, `403`, `404` |
| `PATCH` | `/api/rentals/:id/complete`| Owner/Admin | Return car (`available`) | None | `200`, `400`, `403`, `404` |

---

## 🧮 Business Logic & Mathematical Formulations

### 1. Inclusive Day Span & Billing Calculation

Car rental spans are computed **inclusively** in pure UTC calendar days:

$$\text{totalDays} = (\text{end\_date} - \text{start\_date})_{\text{in days}} + 1$$

$$\text{total\_cost} = \text{round}(\text{totalDays} \times \text{daily\_rate}, 2)$$

#### Worked Example:
- **Vehicle**: Honda City (`daily_rate` = ₹2,500.00)
- **Start Date**: `2026-05-01`
- **End Date**: `2026-05-05`
- **Calculation**: $(5 - 1) + 1 = 5\text{ days}$
- **Total Billing**: $5 \times 2500.00 = ₹12,500.00$
- **Same-Day Rental** (`2026-05-01` to `2026-05-01`): $(0) + 1 = 1\text{ day} \implies ₹2,500.00$

---

### 2. Inclusive Date Range Collision Prevention Algorithm

Two date ranges $[S_1, E_1]$ and $[S_2, E_2]$ conflict **if and only if**:

$$S_1 \le E_2 \quad \text{AND} \quad E_1 \ge S_2$$

```
Existing Booking: [================] (2026-05-01 to 2026-05-05)

Case 1 (Overlap):        [==============] (2026-05-03 to 2026-05-07) ➔ ❌ 400 CONFLICT
Case 2 (Inside):            [====]         (2026-05-02 to 2026-05-04) ➔ ❌ 400 CONFLICT
Case 3 (Boundary):                 [===]   (2026-05-05 to 2026-05-08) ➔ ❌ 400 CONFLICT
Case 4 (Adjacent):                  [===]  (2026-05-06 to 2026-05-09) ➔ ✔️ 201 OK
```

In the Supabase SDK query:
```javascript
const { data: conflicts } = await supabaseAdmin
  .from('rentals')
  .select('id, start_date, end_date')
  .eq('vehicle_id', vehicle_id)
  .in('status', ['booked', 'active'])
  .lte('start_date', end_date)
  .gte('end_date', start_date);
```

---

### 3. PostgreSQL Exclusion Constraint Safety Net

To defend against high-concurrency race conditions where two simultaneous HTTP requests pass the SDK check at the exact same millisecond, the database schema enforces a PostgreSQL exclusion constraint backed by the `btree_gist` index:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE rentals ADD CONSTRAINT no_double_booking 
EXCLUDE USING gist (
    vehicle_id WITH =, 
    daterange(start_date, end_date, '[]') WITH &&
) WHERE (status IN ('booked', 'active'));
```

When a race condition occurs, PostgreSQL throws error code `23P01`, which our centralized error middleware cleanly maps to `400 Bad Request: Vehicle already reserved during this timeframe.`

---

### 4. Fleet & Rental State Machine Transitions

```
[Rental State Machine]
  booked ────────────► active ────────────► completed
    │                    │
    ├────────────────────┘
    ▼
  cancelled

[Vehicle Availability Transitions]
  available ────────── (Pickup: PATCH /api/rentals/:id/pickup) ─────────► rented
      ▲                                                                     │
      └────────────── (Complete: PATCH /api/rentals/:id/complete) ──────────┘
      ▲
      │ (Admin PUT /api/vehicles/:id)
      ▼
  maintenance
```

- A vehicle cannot be put under maintenance if it is currently `rented` by an active booking.
- A vehicle cannot be deleted if it has `booked` or `active` reservations.
- If a vehicle has completed/cancelled historical records, PostgreSQL foreign key constraints (`ON DELETE RESTRICT`) prevent deletion; the API instructs the admin to set status to `maintenance`.

---

## 🔒 Authentication & Security Architecture

1. **Supabase Auth Admin Integration**:
   - Registration creates users using `supabaseAdmin.auth.admin.createUser({ email_confirm: true })`.
   - **Trade-off**: Pre-confirms emails so evaluation/testing is frictionless and avoids hitting Supabase SMTP rate limits.
2. **Role-Based Access Control (RBAC)**:
   - User roles are stored securely in `app_metadata.role` (only settable by the server/Admin API, never by client payloads).
   - `requireAdmin` middleware blocks non-admin users with `403 Forbidden`.
3. **Isolated Auth Clients**:
   - `config/supabase.js` exports `createAuthClient()` for user login to prevent mutating shared server client credentials.
4. **Service Role Key Security**:
   - `SUPABASE_SERVICE_ROLE_KEY` is loaded strictly on the server and is never exposed in client bundles or public endpoints.

---

## 🧪 Postman Collection & Automated Testing

### Running the Autonomous Test Suite
```bash
npm run test:smoke
```

The smoke test suite verifies:
1. Supabase database connectivity & seed table checks.
2. Customer registration, login, profile inspection, duplicate/invalid data handling.
3. Admin vehicle creation (Tesla Model 3), role guards (`403 Forbidden` for customers).
4. Relational vehicle inspection (`/api/vehicles/:id`) with PII redaction.
5. Assignment core scenario: `2026-05-01` to `2026-05-05` (201 Created) ➔ `2026-05-03` to `2026-05-07` (400 Conflict).
6. Comprehensive dynamic date collision matrix (inside, outside, boundary start, boundary end, adjacent next-day, different vehicle).
7. Concurrency testing via `Promise.all` simulating race conditions.
8. State transitions: `booked` ➔ `active` (`rented`) ➔ `completed` (`available`).
9. Foreign key deletion restrictions and database cleanup.

### Importing to Postman
1. Open Postman ➔ Click **Import**.
2. Select [`postman/CarRental_API.postman_collection.json`](postman/CarRental_API.postman_collection.json).
3. Select [`postman/CarRental_API.postman_environment.json`](postman/CarRental_API.postman_environment.json).
4. Set `baseUrl` to `http://localhost:5000` (or your live Render URL) and run the collection sequentially!

---

## ☁️ Deployment on Render

1. **Push Repository to GitHub**:
   ```bash
   cd Kartik_Wagh
   git init
   git add .
   git commit -m "Initial commit: Car Rental & Fleet Management API"
   git branch -M main
   git remote add origin https://github.com/<your-username>/itm-assignment-10-car-rental-api.git
   git push -u origin main
   ```

2. **Create Web Service on Render**:
   - Sign in to [render.com](https://render.com/) and click **New + ➔ Web Service**.
   - Connect your GitHub repository `itm-assignment-10-car-rental-api`.
   - Configure the service:
     - **Name**: `itm-assignment-10-car-rental-api`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`

3. **Set Environment Variables**:
   Under the **Environment** tab, add:
   - `NODE_ENV` = `production`
   - `NODE_VERSION` = `20`
   - `ALLOW_PAST_DATES` = `true`
   - `SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `SUPABASE_ANON_KEY` = `<your-anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<your-service-role-key>`
   - **Health Check Path**: `/health`

4. **Live Verification**:
   ```bash
   curl https://<your-service-name>.onrender.com/health
   ```

---

## ❓ Troubleshooting & FAQs

| Issue | Root Cause | Solution |
|---|---|---|
| `App exits on startup with missing env` | `.env` variables are missing or have placeholders. | Verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. |
| `relation "vehicles" does not exist` | Supabase schema has not been run. | Execute `database/schema.sql` and `database/seed.sql` in the Supabase SQL Editor. |
| `403 Admin access required` | User does not have `admin` role in `app_metadata`. | Run `npm run create-admin -- <email> <password>` and log in with that account. |
| `400 Bad Request on past dates` | `ALLOW_PAST_DATES` is set to `false`. | Set `ALLOW_PAST_DATES=true` in `.env` or Render environment settings. |
| `Render Free Tier Cold Starts` | Render sleeps free instances after 15 minutes of inactivity. | Allow 30–50 seconds for the initial wake-up ping to `/health`. |



DEPLOYMENT LINK: https://assignment-10-car-rental-system-api-ch2o.onrender.com/
