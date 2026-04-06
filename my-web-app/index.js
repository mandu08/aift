const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
require('dotenv').config();

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'mysecret',
    resave: false,
    saveUninitialized: false
}));

// 로그인 체크 미들웨어
const checkAuth = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// 1. 메인 페이지 - 글 목록
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT posts.*, users.username FROM posts JOIN users ON posts.author_id = users.id ORDER BY created_at DESC');
        res.render('main', { posts: result.rows, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send("데이터베이스 연결 오류");
    }
});

// 2. 회원가입/로그인 페이지
app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [req.body.username, hashedPassword]);
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [req.body.username]);
    if (result.rows[0] && await bcrypt.compare(req.body.password, result.rows[0].password)) {
        req.session.userId = result.rows[0].id;
        req.session.user = result.rows[0].username;
        return res.redirect('/');
    }
    res.send("로그인 실패 - 아이디나 비번 확인");
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. 글 상세 페이지 (댓글, 좋아요 포함)
app.get('/post/:id', async (req, res) => {
    const post = await pool.query('SELECT posts.*, users.username FROM posts JOIN users ON posts.author_id = users.id WHERE posts.id = $1', [req.params.id]);
    const comments = await pool.query('SELECT comments.*, users.username FROM comments JOIN users ON comments.author_id = users.id WHERE post_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const likes = await pool.query('SELECT COUNT(*) FROM likes WHERE post_id = $1', [req.params.id]);
    res.render('post_detail', { post: post.rows[0], comments: comments.rows, likeCount: likes.rows[0].count, user: req.session.user });
});

// 댓글 작성
app.post('/post/:id/comment', checkAuth, async (req, res) => {
    await pool.query('INSERT INTO comments (post_id, author_id, content) VALUES ($1, $2, $3)', [req.params.id, req.session.userId, req.body.content]);
    res.redirect(`/post/${req.params.id}`);
});

// 좋아요 토글
app.post('/post/:id/like', checkAuth, async (req, res) => {
    try {
        await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [req.session.userId, req.params.id]);
    } catch (e) {
        await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [req.session.userId, req.params.id]);
    }
    res.redirect(`/post/${req.params.id}`);
});

// 4. 마이 페이지
app.get('/mypage', checkAuth, async (req, res) => {
    const myPosts = await pool.query('SELECT * FROM posts WHERE author_id = $1', [req.session.userId]);
    res.render('mypage', { posts: myPosts.rows, user: req.session.user });
});

// 5. 글 작성/수정
app.get('/write', checkAuth, (req, res) => res.render('write'));
app.post('/write', checkAuth, async (req, res) => {
    await pool.query('INSERT INTO posts (title, content, author_id) VALUES ($1, $2, $3)', [req.body.title, req.body.content, req.session.userId]);
    res.redirect('/mypage');
});

app.get('/edit/:id', checkAuth, async (req, res) => {
    const post = await pool.query('SELECT * FROM posts WHERE id = $1 AND author_id = $2', [req.params.id, req.session.userId]);
    res.render('edit', { post: post.rows[0] });
});
app.post('/edit/:id', checkAuth, async (req, res) => {
    await pool.query('UPDATE posts SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND author_id = $4', [req.body.title, req.body.content, req.params.id, req.session.userId]);
    res.redirect('/mypage');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
