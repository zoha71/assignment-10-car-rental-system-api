#!/usr/bin/env node
require('dotenv').config();
const { supabaseAdmin } = require('../config/supabase');

async function createOrUpdateAdmin() {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1];
  const name = args[2] || 'Admin User';

  if (!email || !password) {
    console.error('\n❌ Usage: npm run create-admin -- <email> <password> [name]');
    console.error('   Example: npm run create-admin -- admin@rental.com Admin@123 "System Admin"\n');
    process.exit(1);
  }

  if (!supabaseAdmin) {
    console.error('\n❌ Supabase configuration missing. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file.\n');
    process.exit(1);
  }

  console.log(`\n⏳ Provisioning Admin Account: ${email}...`);

  try {
    // 1. List users to check if user already exists
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      throw listError;
    }

    const existingUser = (users || []).find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // Update existing user with admin role
      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          app_metadata: { role: 'admin' },
          user_metadata: { name },
        }
      );

      if (updateError) throw updateError;

      console.log(`\n✅ Existing user upgraded to Admin!`);
      console.log(`   User ID: ${updated.user.id}`);
      console.log(`   Email:   ${updated.user.email}`);
      console.log(`   Role:    ${updated.user.app_metadata.role}\n`);
    } else {
      // Create brand new admin user
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role: 'admin' },
      });

      if (createError) throw createError;

      console.log(`\n✅ New Admin User created successfully!`);
      console.log(`   User ID: ${created.user.id}`);
      console.log(`   Email:   ${created.user.email}`);
      console.log(`   Role:    ${created.user.app_metadata.role}\n`);
    }

    console.log('You can now log in using these credentials at POST /api/auth/login to receive an Admin JWT token.\n');
  } catch (err) {
    console.error(`\n❌ Failed to create/update admin user:`, err.message || err);
    process.exit(1);
  }
}

createOrUpdateAdmin();
