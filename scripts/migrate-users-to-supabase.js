import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const loadEnvFile = (filename) => {
  const filePath = path.join(projectRoot, filename);

  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');

  fileContents.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const equalsIndex = trimmedLine.indexOf('=');

    if (equalsIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const rawValue = trimmedLine.slice(equalsIndex + 1).trim();
    const normalizedValue = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!(key in process.env)) {
      process.env[key] = normalizedValue;
    }
  });
};

loadEnvFile('.env');
loadEnvFile(process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    mode: 'invite',
    dryRun: false,
    limit: null
  };

  args.forEach((arg) => {
    if (arg === '--dry-run') {
      options.dryRun = true;
      return;
    }

    if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1] || options.mode;
      return;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      options.limit = Number.isFinite(value) && value > 0 ? value : null;
    }
  });

  if (!['invite', 'create'].includes(options.mode)) {
    throw new Error('Invalid mode. Use --mode=invite or --mode=create.');
  }

  return options;
};

const options = parseArgs();
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const hasPgConfig = Boolean(
  process.env.PGHOST &&
  process.env.PGUSER &&
  process.env.PGDATABASE
);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inviteRedirectTo =
  process.env.SUPABASE_INVITE_REDIRECT_URL ||
  process.env.VITE_APP_URL ||
  process.env.CORS_ORIGIN;

if (!connectionString && !hasPgConfig) {
  throw new Error('DATABASE_URL, SUPABASE_DB_URL, or PGHOST/PGUSER/PGDATABASE must be set before running the migration.');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before running the migration.');
}

const shouldUseSsl =
  process.env.PGSSLMODE === 'require' ||
  process.env.NODE_ENV === 'production' ||
  Boolean(connectionString?.includes('supabase'));

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: shouldUseSsl
        ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false
    })
  : new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE,
      ssl: shouldUseSsl
        ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false
    });

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const buildMetadata = (user) => ({
  account_type: user.account_type === 'business' ? 'business' : 'client',
  full_name: user.full_name || null,
  business_name: user.business_name || null,
  business_type: user.business_type || null,
  city: user.city || null,
  phone: user.phone || null
});

const buildTemporaryPassword = () =>
  `FinFlow-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-6)}`;

const findSupabaseUserByEmail = async (email) => {
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const match = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());

    if (match) {
      return match;
    }

    if (users.length < 200) {
      return null;
    }

    page += 1;
  }
};

const linkLocalUser = async (userId, authUserId) => {
  await pool.query(
    `
      UPDATE users
      SET auth_user_id = $1
      WHERE user_id = $2
    `,
    [authUserId, userId]
  );
};

const fetchUsersToMigrate = async () => {
  const params = [];
  const limitClause = options.limit ? `LIMIT $1` : '';

  if (options.limit) {
    params.push(options.limit);
  }

  const result = await pool.query(
    `
      SELECT
        user_id,
        full_name,
        business_name,
        email,
        account_type,
        business_type,
        city,
        phone,
        auth_user_id
      FROM users
      WHERE auth_user_id IS NULL
      ORDER BY user_id ASC
      ${limitClause}
    `,
    params
  );

  return result.rows;
};

const migrateUser = async (user) => {
  const email = user.email?.toLowerCase();

  if (!email) {
    return {
      userId: user.user_id,
      email: user.email,
      status: 'skipped',
      reason: 'Missing email'
    };
  }

  const metadata = buildMetadata(user);
  const existingSupabaseUser = await findSupabaseUserByEmail(email);

  if (existingSupabaseUser) {
    if (!options.dryRun) {
      await supabaseAdmin.auth.admin.updateUserById(existingSupabaseUser.id, {
        user_metadata: {
          ...existingSupabaseUser.user_metadata,
          ...metadata
        },
        email_confirm: true
      });
      await linkLocalUser(user.user_id, existingSupabaseUser.id);
    }

    return {
      userId: user.user_id,
      email,
      status: 'linked-existing',
      authUserId: existingSupabaseUser.id
    };
  }

  if (options.mode === 'invite') {
    if (options.dryRun) {
      return {
        userId: user.user_id,
        email,
        status: 'would-invite'
      };
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: inviteRedirectTo
    });

    if (error) {
      throw error;
    }

    if (data?.user?.id) {
      await linkLocalUser(user.user_id, data.user.id);
    }

    return {
      userId: user.user_id,
      email,
      status: 'invited',
      authUserId: data?.user?.id || null
    };
  }

  const temporaryPassword = buildTemporaryPassword();

  if (options.dryRun) {
    return {
      userId: user.user_id,
      email,
      status: 'would-create',
      temporaryPassword
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: metadata
  });

  if (error) {
    throw error;
  }

  if (data?.user?.id) {
    await linkLocalUser(user.user_id, data.user.id);
  }

  return {
    userId: user.user_id,
    email,
    status: 'created',
    authUserId: data?.user?.id || null,
    temporaryPassword
  };
};

const main = async () => {
  const users = await fetchUsersToMigrate();

  if (users.length === 0) {
    console.log('No users need migration.');
    return;
  }

  const results = [];

  for (const user of users) {
    try {
      const result = await migrateUser(user);
      results.push(result);
      console.log(`${result.status}: ${result.email}`);
    } catch (error) {
      results.push({
        userId: user.user_id,
        email: user.email,
        status: 'failed',
        reason: error.message
      });
      console.error(`failed: ${user.email} -> ${error.message}`);
    }
  }

  const reportPath = path.join(projectRoot, 'supabase-user-migration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    dryRun: options.dryRun,
    results
  }, null, 2));

  const summary = results.reduce((accumulator, item) => {
    accumulator[item.status] = (accumulator[item.status] || 0) + 1;
    return accumulator;
  }, {});

  console.log('');
  console.log('Migration summary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report written to ${reportPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
