const Database = require('better-sqlite3');
const db = new Database('sqlite.db');

try {
  const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
  const info = insert.run('Demo User');
  console.log('Inserted dummy user with ID:', info.lastInsertRowid);
} catch (error) {
  console.error('Seed failed:', error);
}

db.close();
