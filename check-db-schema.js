import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

async function checkSchema() {
  // Check what tables exist
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  
  console.log('Tables:', tables.map(t => t.table_name));
  
  // For each table, get columns
  for (const table of tables) {
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = ${table.table_name}
      ORDER BY ordinal_position
    `;
    console.log(`\n${table.table_name}:`, columns.map(c => `${c.column_name}:${c.data_type}`).join(', '));
  }
  
  await sql.end();
}

checkSchema().catch(console.error);
