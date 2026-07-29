const express = require('express');
const router = express.Router();
const {getUserNAme,  registerUser, loginUser, getUserProfile } = require('../controllers/authController');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'your-secret-key';

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(403).json({ message: 'Access denied' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/user', getUserNAme);
router.get('/profile', authenticateToken, getUserProfile);

module.exports = router;
