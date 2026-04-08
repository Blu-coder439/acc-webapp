import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadEnvFile = (filename) => {
    const filePath = path.join(__dirname, filename);

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

const app = express();
const PORT = Number(process.env.PORT || 3000);
const VALID_PROCESS_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const VALID_TRANSACTION_TYPES = new Set(['Revenue', 'Expense', 'Receivable', 'Payable']);
const VALID_TRANSACTION_STATUSES = new Set([
    'Cleared',
    'Processed',
    'Pending',
    'Scheduled',
    'Overdue',
    'Due Soon',
    'Open',
    'Urgent',
    'Upcoming'
]);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors(allowedOrigins.length > 0 ? {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'));
    }
} : undefined));
app.use(express.json());

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const shouldUseSsl = process.env.PGSSLMODE === 'require'
    || process.env.NODE_ENV === 'production'
    || Boolean(connectionString?.includes('supabase'));

const pool = connectionString
    ? new Pool({
        connectionString,
        ssl: shouldUseSsl
            ? {
                rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
            : false
    })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'demographic',
        ssl: shouldUseSsl
            ? {
                rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
            : false
    });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;

const ensureDatabaseSchema = async () => {
    await pool.query(`
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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS processes (
            process_id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
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

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS auth_user_id TEXT
    `);

    await pool.query(`
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
};

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
    if (!storedHash?.includes(':')) {
        return password === storedHash;
    }

    const [salt, savedHash] = storedHash.split(':');

    if (!salt || !savedHash) {
        return false;
    }

    const hashBuffer = crypto.scryptSync(password, salt, 64);
    const savedHashBuffer = Buffer.from(savedHash, 'hex');

    if (hashBuffer.length !== savedHashBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(hashBuffer, savedHashBuffer);
};

const buildUserPayloadFromMetadata = (authUser) => {
    const metadata = authUser?.user_metadata || {};
    const accountType = metadata.account_type === 'business' ? 'business' : 'client';

    return {
        authUserId: authUser.id,
        email: authUser.email?.toLowerCase(),
        accountType,
        fullName: accountType === 'client' ? metadata.full_name?.trim() || null : null,
        businessName: accountType === 'business' ? metadata.business_name?.trim() || null : null,
        businessType: accountType === 'business' ? metadata.business_type?.trim() || null : null,
        city: accountType === 'client' ? metadata.city?.trim() || null : null,
        phone: accountType === 'client' ? metadata.phone?.trim() || null : null
    };
};

const syncAppUserFromAuthUser = async (authUser) => {
    const profile = buildUserPayloadFromMetadata(authUser);

    if (!profile.email || !profile.authUserId) {
        throw new Error('Supabase user is missing an email or id.');
    }

    const existingUser = await pool.query(
        `
            SELECT
                user_id,
                email
            FROM users
            WHERE auth_user_id = $1 OR email = $2
            ORDER BY user_id ASC
            LIMIT 1
        `,
        [profile.authUserId, profile.email]
    );

    if (existingUser.rowCount > 0) {
        const updatedUser = await pool.query(
            `
                UPDATE users
                SET
                    auth_user_id = $1,
                    full_name = $2,
                    business_name = $3,
                    email = $4,
                    account_type = $5,
                    business_type = $6,
                    city = $7,
                    phone = $8,
                    last_login = CURRENT_TIMESTAMP
                WHERE user_id = $9
                RETURNING
                    user_id,
                    auth_user_id,
                    full_name,
                    business_name,
                    email,
                    account_type,
                    business_type,
                    city,
                    phone
            `,
            [
                profile.authUserId,
                profile.fullName,
                profile.businessName,
                profile.email,
                profile.accountType,
                profile.businessType,
                profile.city,
                profile.phone,
                existingUser.rows[0].user_id
            ]
        );

        return updatedUser.rows[0];
    }

    const insertedUser = await pool.query(
        `
            INSERT INTO users (
                auth_user_id,
                full_name,
                business_name,
                email,
                password_hash,
                account_type,
                business_type,
                city,
                phone,
                last_login
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
            RETURNING
                user_id,
                auth_user_id,
                full_name,
                business_name,
                email,
                account_type,
                business_type,
                city,
                phone
        `,
        [
            profile.authUserId,
            profile.fullName,
            profile.businessName,
            profile.email,
            `supabase-auth:${profile.authUserId}`,
            profile.accountType,
            profile.businessType,
            profile.city,
            profile.phone
        ]
    );

    return insertedUser.rows[0];
};

const signupHandler = async (req, res) => {
    const {
        fullName,
        businessName,
        email,
        password,
        accountType,
        businessType,
        city,
        phone
    } = req.body;

    try {
        const normalizedAccountType = accountType === 'business' ? 'business' : 'client';
        const resolvedFullName = normalizedAccountType === 'client' ? fullName?.trim() : null;
        const resolvedBusinessName = normalizedAccountType === 'business' ? businessName?.trim() : null;

        if ((!resolvedFullName && !resolvedBusinessName) || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const normalizedEmail = email.toLowerCase();
        const existingUser = await pool.query(
            'SELECT user_id FROM users WHERE email = $1',
            [normalizedEmail]
        );

        if (existingUser.rowCount > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const result = await pool.query(
            `
                INSERT INTO users (
                    full_name,
                    business_name,
                    email,
                    password_hash,
                    account_type,
                    business_type,
                    city,
                    phone
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING user_id, full_name, business_name, email, account_type, business_type, city, phone
            `,
            [
                resolvedFullName,
                resolvedBusinessName,
                normalizedEmail,
                hashPassword(password),
                normalizedAccountType,
                normalizedAccountType === 'business' ? businessType || null : null,
                normalizedAccountType === 'client' ? city || null : null,
                normalizedAccountType === 'client' ? phone || null : null
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Signup failed. Check that your table columns match the server.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
};

const loginHandler = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const result = await pool.query(
            `
                SELECT
                    user_id,
                    full_name,
                    business_name,
                    email,
                    password_hash,
                    account_type,
                    business_type,
                    city,
                    phone
                FROM users
                WHERE email = $1
            `,
            [email.toLowerCase()]
        );

        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        if (!verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
            [user.user_id]
        );

        res.status(200).json({
            message: 'Login successful',
            user: {
                user_id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                business_name: user.business_name,
                account_type: user.account_type,
                business_type: user.business_type,
                city: user.city,
                phone: user.phone
            }
        });
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Login failed',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
};

app.post('/signup', signupHandler);
app.post('/api/auth/signup', signupHandler);

app.post('/login', loginHandler);
app.post('/api/auth/login', loginHandler);

app.post('/api/auth/sync', async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Supabase admin is not configured on the server.' });
        }

        const authorizationHeader = req.headers.authorization || '';
        const accessToken = authorizationHeader.startsWith('Bearer ')
            ? authorizationHeader.slice('Bearer '.length).trim()
            : '';

        if (!accessToken) {
            return res.status(401).json({ error: 'Missing Supabase access token.' });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

        if (error || !data?.user) {
            return res.status(401).json({ error: 'Invalid Supabase session.' });
        }

        const syncedUser = await syncAppUserFromAuthUser(data.user);

        res.status(200).json({
            user: syncedUser
        });
    } catch (err) {
        console.error('Supabase sync error:', err.message);
        res.status(500).json({
            error: 'Could not sync Supabase user.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ ok: true });
    } catch (err) {
        res.status(500).json({
            ok: false,
            error: 'Database connection failed.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

app.get('/processes', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({ error: 'userId is required.' });
        }

        const result = await pool.query(
            `
                SELECT
                    process_id,
                    user_id,
                    title,
                    description,
                    status,
                    created_at
                FROM processes
                WHERE user_id = $1
                ORDER BY created_at DESC, process_id DESC
            `,
            [userId]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Could not load processes.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

app.post('/processes', async (req, res) => {
    const { userId, title, description, status } = req.body;

    try {
        const normalizedTitle = title?.trim();
        const normalizedStatus = VALID_PROCESS_STATUSES.has(status) ? status : 'pending';

        if (!userId || !normalizedTitle) {
            return res.status(400).json({ error: 'userId and title are required.' });
        }

        const userExists = await pool.query(
            'SELECT user_id FROM users WHERE user_id = $1',
            [userId]
        );

        if (userExists.rowCount === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const result = await pool.query(
            `
                INSERT INTO processes (
                    user_id,
                    title,
                    description,
                    status
                )
                VALUES ($1, $2, $3, $4)
                RETURNING process_id, user_id, title, description, status, created_at
            `,
            [userId, normalizedTitle, description?.trim() || null, normalizedStatus]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Could not create process.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

app.get('/transactions', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({ error: 'userId is required.' });
        }

        const result = await pool.query(
            `
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
                WHERE user_id = $1
                ORDER BY transaction_date DESC, transaction_id DESC
            `,
            [userId]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Could not load transactions.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

app.post('/transactions', async (req, res) => {
    const {
        userId,
        partyName,
        category,
        entryType,
        amount,
        paymentMethod,
        transactionDate,
        dueDate,
        status,
        notes
    } = req.body;

    try {
        const normalizedPartyName = partyName?.trim();
        const normalizedCategory = category?.trim();
        const normalizedEntryType = VALID_TRANSACTION_TYPES.has(entryType) ? entryType : null;
        const normalizedStatus = VALID_TRANSACTION_STATUSES.has(status) ? status : 'Pending';
        const parsedAmount = Number(amount);

        if (!userId || !normalizedPartyName || !normalizedCategory || !normalizedEntryType || Number.isNaN(parsedAmount) || parsedAmount < 0) {
            return res.status(400).json({
                error: 'userId, partyName, category, entryType, and a valid amount are required.'
            });
        }

        const userExists = await pool.query(
            'SELECT user_id FROM users WHERE user_id = $1',
            [userId]
        );

        if (userExists.rowCount === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const result = await pool.query(
            `
                INSERT INTO bookkeeping_transactions (
                    user_id,
                    party_name,
                    category,
                    entry_type,
                    amount,
                    payment_method,
                    transaction_date,
                    due_date,
                    status,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9, $10)
                RETURNING
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
            `,
            [
                userId,
                normalizedPartyName,
                normalizedCategory,
                normalizedEntryType,
                parsedAmount,
                paymentMethod?.trim() || null,
                transactionDate || null,
                dueDate || null,
                normalizedStatus,
                notes?.trim() || null
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({
            error: 'Could not create transaction.',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

const startServer = async () => {
    try {
        await ensureDatabaseSchema();
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to initialize database schema:', err.message);
        process.exit(1);
    }
};

startServer();
