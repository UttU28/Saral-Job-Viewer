import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: '10.0.0.17',
  user: 'utsav',
  password: process.env.MYSQL_PASSWORD,
  database: 'bhawishyaWani'
};

export async function GET() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
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
      WHERE applied = "NO"
      ORDER BY timeStamp DESC
    `);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error querying jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs from database' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}