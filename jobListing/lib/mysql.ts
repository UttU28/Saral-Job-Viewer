import mysql from 'mysql2/promise';

const dbConfig = {
  host: '10.0.0.17',
  user: 'utsav',
  password: process.env.MYSQL_PASSWORD, // This should be set in .env
  database: 'bhawishyaWani'
};

export async function createMySQLConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
    throw error;
  }
}

export async function queryJobs() {
  let connection;
  try {
    connection = await createMySQLConnection();
    const [rows] = await connection.execute(`
      SELECT 
        id,
        link,
        title,
        companyName,
        location,
        method,
        UNIX_TIMESTAMP(timeStamp) as timeStamp,
        jobType,
        jobDescription,
        applied
      FROM allJobData
      ORDER BY timeStamp DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error querying jobs:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}