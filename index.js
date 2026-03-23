const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Neon(PostgreSQL) 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Render + Neon 환경에서 필요
  },
});

// 기본 라우트
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM test LIMIT 1');

    if (result.rows.length === 0) {
      return res.send('데이터가 없습니다');
    }

    const name = result.rows[0].name;

    res.send(`HELLO ${name}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('서버 에러');
  }
});

// 서버 실행
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
