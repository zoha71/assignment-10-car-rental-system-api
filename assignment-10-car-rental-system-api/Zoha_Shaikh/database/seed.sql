-- ============================================================================
-- Assignment 10: Seed Data for Vehicles Table
-- ============================================================================

-- Ensure 5 sample vehicles across all categories with realistic INR daily rates
-- Vehicle #1 is healthy and available (primary target for testing guide scenarios)
INSERT INTO vehicles (brand, model, year, category, daily_rate, fuel_type, seating_capacity, status)
VALUES
    -- 1. Available Sedan (Vehicle #1 in tests)
    ('Honda', 'City', 2023, 'Sedan', 2500.00, 'Petrol', 5, 'available'),
    
    -- 2. Electric (Assignment example: Tesla Model 3)
    ('Tesla', 'Model 3', 2024, 'Electric', 4500.00, 'EV', 5, 'available'),
    
    -- 3. Available SUV (7 Seater)
    ('Toyota', 'Fortuner', 2023, 'SUV', 5500.00, 'Diesel', 7, 'available'),
    
    -- 4. Luxury Sedan
    ('Mercedes-Benz', 'C-Class', 2024, 'Luxury', 8500.00, 'Petrol', 5, 'available'),
    
    -- 5. Hatchback under Maintenance
    ('Hyundai', 'i20', 2022, 'Hatchback', 1800.00, 'Petrol', 5, 'maintenance');
