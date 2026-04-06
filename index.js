require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// 🔐 환경 변수 체크
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 없음");
}

// PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// JWT 비밀키
const SECRET = process.env.JWT_SECRET || "dev_secret_key";

// 기본 테스트 라우트
app.get("/", (req, res) => {
  res.send("서버 정상 작동 중");
});

// 🔐 회원가입
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashed]
    );

    res.send("회원가입 성공");
  } catch (err) {
    res.status(500).send("회원가입 실패");
  }
});

// 🔐 로그인
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [username]
    );

    if (result.rows.length === 0)
      return res.status(400).send("유저 없음");

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send("비밀번호 틀림");

    const token = jwt.sign({ id: user.id }, SECRET);
    res.json({ token });
  } catch {
    res.status(500).send("로그인 실패");
  }
});

// 🔑 인증 미들웨어
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send("로그인 필요");

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).send("토큰 오류");
  }
}

// ✏️ 글 작성
app.post("/posts", auth, async (req, res) => {
  try {
    const { title, content } = req.body;

    await pool.query(
      "INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3)",
      [title, content, req.user.id]
    );

    res.send("글 작성 완료");
  } catch {
    res.status(500).send("글 작성 실패");
  }
});

// 📄 글 목록
app.get("/posts", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title FROM posts ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch {
    res.status(500).send("조회 실패");
  }
});

// 📖 글 상세
app.get("/posts/:id", async (req, res) => {
  try {
    const post = await pool.query(
      "SELECT * FROM posts WHERE id=$1",
      [req.params.id]
    );

    const comments = await pool.query(
      "SELECT * FROM comments WHERE post_id=$1",
      [req.params.id]
    );

    const likes = await pool.query(
      "SELECT COUNT(*) FROM likes WHERE post_id=$1",
      [req.params.id]
    );

    res.json({
      post: post.rows[0],
      comments: comments.rows,
      likes: likes.rows[0].count,
    });
  } catch {
    res.status(500).send("조회 실패");
  }
});

// ✏️ 글 수정
app.put("/posts/:id", auth, async (req, res) => {
  try {
    const { title, content } = req.body;

    await pool.query(
      "UPDATE posts SET title=$1, content=$2 WHERE id=$3 AND author_id=$4",
      [title, content, req.params.id, req.user.id]
    );

    res.send("수정 완료");
  } catch {
    res.status(500).send("수정 실패");
  }
});

// 💬 댓글 작성
app.post("/comments", auth, async (req, res) => {
  try {
    const { content, post_id } = req.body;

    await pool.query(
      "INSERT INTO comments (content, author_id, post_id) VALUES ($1, $2, $3)",
      [content, req.user.id, post_id]
    );

    res.send("댓글 작성 완료");
  } catch {
    res.status(500).send("댓글 실패");
  }
});

// ❤️ 좋아요
app.post("/like/:post_id", auth, async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO likes (user_id, post_id) VALUES ($1, $2)",
      [req.user.id, req.params.post_id]
    );
    res.send("좋아요 성공");
  } catch {
    res.send("이미 좋아요 누름");
  }
});

// 👤 마이페이지
app.get("/mypage", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM posts WHERE author_id=$1",
      [req.user.id]
    );

    res.json(result.rows);
  } catch {
    res.status(500).send("조회 실패");
  }
});

// 🚨 Render 필수 PORT 설정
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`서버 실행 중 (PORT: ${PORT})`);
});
