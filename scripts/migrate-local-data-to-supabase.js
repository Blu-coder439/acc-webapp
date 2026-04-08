import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import { fileURLToPath } from 'url';

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

const options = {
  dryRun: process.argv.slice(2).includes('--dry-run')
};

const createPoolFromEnv = ({
  connectionKey,
  hostKey,
  portKey,
  userKey,
  passwordKey,
  databaseKey,
  fallback
}) => {
  const connectionString = process.env[connectionKey];

  if (connectionString) {
    const shouldUseSsl =
      process.env.PGSSLMODE === 'require' ||
      process.env.NODE_ENV === 'production' ||
      connectionString.includes('supabase');

    return new Pool({
      connectionString,
      ssl: shouldUseSsl
        ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false
    });
  }

  return new Pool({
    host: process.env[hostKey] || fallback.host,
    port: Number(process.env[portKey] || fallback.port),
    user: process.env[userKey] || fallback.user,
    password: process.env[passwordKey] || fallback.password,
    database: process.env[databaseKey] || fallback.database,
    ssl: fallback.ssl
  });
};

const sourcePool = createPoolFromEnv({
  connectionKey: 'SOURCE_DATABASE_URL',
  hostKey: 'SOURCE_PGHOST',
  portKey: 'SOURCE_PGPORT',
  userKey: 'SOURCE_PGUSER',
  passwordKey: 'SOURCE_PGPASSWORD',
  databaseKey: 'SOURCE_PGDATABASE',
  fallback: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'demographic',
    ssl: false
  }
});

if (!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set for the Supabase target database.');
}

const targetPool = createPoolFromEnv({
  connectionKey: 'DATABASE_URL',
  hostKey: 'PGHOST',
  portKey: 'PGPORT',
  userKey: 'PGUSER',
  passwordKey: 'PGPASSWORD',
  databaseKey: 'PGDATABASE',
  fallback: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'demographic',
    ssl: false
  }
});

const ensureTargetSchema = async () => {
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      auth_user_id TEXT UNIQUE,
      full_name TEXT,
      business_name TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'client',
      business_type TEXT,
      city TEXT,
      phone TEXT,
      last_login TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await targetPool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_user_id TEXT
  `);

  await targetPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'users_auth_user_id_unique'
      ) THEN
        CREATE UNIQUE INDEX users_auth_user_id_unique
        ON users (auth_user_id)
        WHERE auth_user_id IS NOT NULL;
      END IF;
    END
    $$;
  `);

  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS processes (
      process_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS bookkeeping_transactions (
      transaction_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      party_name TEXT NOT NULL,
      category TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
      payment_method TEXT,
      transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const sourceColumnExists = async (tableName, columnName) => {
  const result = await sourcePool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return result.rowCount > 0;
};

const setSequence = async (tableName, idColumn) => {
  await targetPool.query(
    `
      SELECT setval(
        pg_get_serial_sequence($1, $2),
        COALESCE((SELECT MAX(${idColumn}) FROM ${tableName}), 1),
        true
      )
    `,
    [tableName, idColumn]
  );
};

const fetchSourceRows = async () => {
  const hasAuthUserIdColumn = await sourceColumnExists('users', 'auth_user_id');

  const [usersResult, processesResult, transactionsResult] = await Promise.all([
    sourcePool.query(`
      SELECT
        user_id,
        ${hasAuthUserIdColumn ? 'auth_user_id' : 'NULL AS auth_user_id'},
        full_name,
        business_name,
        email,
        password_hash,
        account_type,
        business_type,
        city,
        phone,
        last_login,
        created_at
      FROM users
      ORDER BY user_id ASC
    `),
    sourcePool.query(`
      SELECT
        process_id,
        user_id,
        title,
        description,
        status,
        created_at
      FROM processes
      ORDER BY process_id ASC
    `),
    sourcePool.query(`
      SELECT
        transaction_id,
        user_id,
        party_name,
        category,
        entry_type,
        amount,
        payment_method,
        transaction_date,
        due_date,
        status,
        notes,
        created_at
      FROM bookkeeping_transactions
      ORDER BY transaction_id ASC
    `)
  ]);

  return {
    users: usersResult.rows,
    processes: processesResult.rows,
    transactions: transactionsResult.rows
  };
};

const upsertUsers = async (users) => {
  const userIdMap = new Map();

  for (const user of users) {
    const result = await targetPool.query(
      `
        INSERT INTO users (
          user_id,
          auth_user_id,
          full_name,
          business_name,
          email,
          password_hash,
          account_type,
          business_type,
          city,
          phone,
          last_login,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP))
        ON CONFLICT (email)
        DO UPDATE SET
          auth_user_id = EXCLUDED.auth_user_id,
          full_name = EXCLUDED.full_name,
          business_name = EXCLUDED.business_name,
          password_hash = EXCLUDED.password_hash,
          account_type = EXCLUDED.account_type,
          business_type = EXCLUDED.business_type,
          city = EXCLUDED.city,
          phone = EXCLUDED.phone,
          last_login = EXCLUDED.last_login
        RETURNING user_id
      `,
      [
        user.user_id,
        user.auth_user_id || null,
        user.full_name || null,
        user.business_name || null,
        user.email,
        user.password_hash,
        user.account_type || 'client',
        user.business_type || null,
        user.city || null,
        user.phone || null,
        user.last_login || null,
        user.created_at || null
      ]
    );

    userIdMap.set(user.user_id, result.rows[0].user_id);
  }

  return userIdMap;
};

const upsertProcesses = async (processes, userIdMap) => {
  for (const process of processes) {
    const mappedUserId = userIdMap.get(process.user_id);

    if (!mappedUserId) {
      continue;
    }

    await targetPool.query(
      `
        INSERT INTO processes (
          process_id,
          user_id,
          title,
          description,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP))
        ON CONFLICT (process_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status
      `,
      [
        process.process_id,
        mappedUserId,
        process.title,
        process.description || null,
        process.status || 'pending',
        process.created_at || null
      ]
    );
  }
};

const upsertTransactions = async (transactions, userIdMap) => {
  for (const transaction of transactions) {
    const mappedUserId = userIdMap.get(transaction.user_id);

    if (!mappedUserId) {
      continue;
    }

    await targetPool.query(
      `
        INSERT INTO bookkeeping_transactions (
          transaction_id,
          user_id,
          party_name,
          category,
          entry_type,
          amount,
          payment_method,
          transaction_date,
          due_date,
          status,
          notes,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE), $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP))
        ON CONFLICT (transaction_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          party_name = EXCLUDED.party_name,
          category = EXCLUDED.category,
          entry_type = EXCLUDED.entry_type,
          amount = EXCLUDED.amount,
          payment_method = EXCLUDED.payment_method,
          transaction_date = EXCLUDED.transaction_date,
          due_date = EXCLUDED.due_date,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes
      `,
      [
        transaction.transaction_id,
        mappedUserId,
        transaction.party_name,
        transaction.category,
        transaction.entry_type,
        transaction.amount,
        transaction.payment_method || null,
        transaction.transaction_date || null,
        transaction.due_date || null,
        transaction.status || 'Pending',
        transaction.notes || null,
        transaction.created_at || null
      ]
    );
  }
};

const writeReport = (summary) => {
  const reportPath = path.join(projectRoot, 'supabase-data-migration-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: options.dryRun,
        summary
      },
      null,
      2
    )
  );

  return reportPath;
};

const main = async () => {
  await ensureTargetSchema();
  const sourceRows = await fetchSourceRows();

  const summary = {
    users: sourceRows.users.length,
    processes: sourceRows.processes.length,
    transactions: sourceRows.transactions.length
  };

  if (options.dryRun) {
    const reportPath = writeReport(summary);
    console.log('Dry run complete.');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report written to ${reportPath}`);
    return;
  }

  const userIdMap = await upsertUsers(sourceRows.users);
  await upsertProcesses(sourceRows.processes, userIdMap);
  await upsertTransactions(sourceRows.transactions, userIdMap);
  await setSequence('users', 'user_id');
  await setSequence('processes', 'process_id');
  await setSequence('bookkeeping_transactions', 'transaction_id');

  const reportPath = writeReport(summary);
  console.log('Migration complete.');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report written to ${reportPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  });
