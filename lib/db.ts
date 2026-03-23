import mysql from 'mysql2/promise';

type DbExecuteValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | Blob
  | Buffer
  | Uint8Array
  | DbExecuteValue[]
  | { [key: string]: DbExecuteValue }

function toDbExecuteValue(value: unknown): DbExecuteValue {
  if (value === undefined || value === null) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Date ||
    value instanceof Buffer ||
    value instanceof Uint8Array ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map(toDbExecuteValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, toDbExecuteValue(entry)])
    )
  }
  return String(value)
}

// Load environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
  queueLimit: 0,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
  } : undefined
};

// In development, reuse the pool across module reloads to avoid creating
// multiple pools which exhaust connections.
declare global {
  var __mysqlPool__: mysql.Pool | undefined;
}

const pool: mysql.Pool = globalThis.__mysqlPool__ ?? mysql.createPool(dbConfig);
if (!globalThis.__mysqlPool__) globalThis.__mysqlPool__ = pool;

// Optionally test the connection in non-production environments
async function testConnection() {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.DISABLE_DB_FALLBACK === '1' || process.env.DISABLE_DB_FALLBACK === 'true') return;
  if (!process.env.DB_USER || !process.env.DB_NAME) return;
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('Error connecting to MySQL database:', error);
    return false;
  }
}

void testConnection();

/**
 * Execute a SQL query with parameters
 * @param sql The SQL query to execute
 * @param params Optional parameters for the query
 * @returns Promise resolving to query results
 */
export async function query<T>(sql: string, params?: ReadonlyArray<unknown>): Promise<T> {
  try {
    const safeParams: DbExecuteValue[] = Array.isArray(params) ? params.map(toDbExecuteValue) : []
    if (process.env.DEBUG_DB) {
      console.log('[db] executing', { sql, params: safeParams, types: safeParams.map(p => (p === null ? 'null' : typeof p)) })
    }
    const [rows] = await pool.execute(sql, safeParams)
    return rows as T
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Additional utility function for transactions
export async function transaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default pool;