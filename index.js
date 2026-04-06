require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// PostgreSQL 연결 (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SECRET = "secretkey";

// 🔐 회원가입
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  await pool.query(
    "INSERT INTO users (username, password) VALUES ($1, $2)",
    [username, hashed]
  );

  res.send("회원가입 성공");
});

// 🔐 로그인
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1",
    [username]
  );

  if (result.rows.length === 0) return res.status(400).send("유저 없음");

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(400).send("비밀번호 틀림");

  const token = jwt.sign({ id: user.id }, SECRET);
  res.json({ token });
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
  const { title, content } = req.body;

  await pool.query(
    "INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3)",
    [title, content, req.user.id]
  );

  res.send("글 작성 완료");
});

// 📄 글 목록 (메인 페이지)
app.get("/posts", async (req, res) => {
  const result = await pool.query("SELECT id, title FROM posts");
  res.json(result.rows);
});

// 📖 글 상세
app.get("/posts/:id", async (req, res) => {
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
});

// ✏️ 글 수정
app.put("/posts/:id", auth, async (req, res) => {
  const { title, content } = req.body;

  await pool.query(
    "UPDATE posts SET title=$1, content=$2 WHERE id=$3 AND author_id=$4",
    [title, content, req.params.id, req.user.id]
  );

  res.send("수정 완료");
});

// 💬 댓글 작성
app.post("/comments", auth, async (req, res) => {
  const { content, post_id } = req.body;

  await pool.query(
    "INSERT INTO comments (content, author_id, post_id) VALUES ($1, $2, $3)",
    [content, req.user.id, post_id]
  );

  res.send("댓글 작성 완료");
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
    res.send("이미 좋아요 눌렀음");
  }
});

// 👤 마이페이지 (내 글)
app.get("/mypage", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM posts WHERE author_id=$1",
    [req.user.id]
  );

  res.json(result.rows);
});

// 서버 실행
app.listen(3000, () => {
  console.log("서버 실행 중 (http://localhost:3000)");
});
