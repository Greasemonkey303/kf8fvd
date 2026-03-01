import mysql from 'mysql2/promise';

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
  // eslint-disable-next-line no-var
  var __mysqlPool__: mysql.Pool | undefined;
}

const pool: mysql.Pool = globalThis.__mysqlPool__ ?? mysql.createPool(dbConfig);
if (!globalThis.__mysqlPool__) globalThis.__mysqlPool__ = pool;

// Optionally test the connection in non-production environments
async function testConnection() {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const connection = await pool.getConnection();
    // eslint-disable-next-line no-console
    console.log('Connected to MySQL database successfully');
    connection.release();
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
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
export async function query<T>(sql: string, params?: any[]): Promise<T> {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Database query error:', error);
    throw error;
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