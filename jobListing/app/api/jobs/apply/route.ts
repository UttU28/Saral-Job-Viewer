import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: '10.0.0.17',
  user: 'utsav',
  password: process.env.MYSQL_PASSWORD,
  database: 'bhawishyaWani'
};

export async function POST(request: Request) {
  let connection;
  try {
    const { jobId, method, link } = await request.json();
    
    connection = await mysql.createConnection(dbConfig);
    await connection.execute(
      'UPDATE allJobData SET applied = 1 WHERE id = ?',
      [jobId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error applying to job:', error);
    return NextResponse.json(
      { error: 'Failed to apply to job' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}