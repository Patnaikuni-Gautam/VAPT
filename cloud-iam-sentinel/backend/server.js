// server.js - Main backend entry point
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
require('dotenv').config();

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { authMiddleware } = require('./middleware/authMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const policyRoutes = require('./routes/policyRoutes');
const userRoutes = require('./routes/userRoutes');
const whitelistRoutes = require('./routes/whitelistRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet()); // Set security-related HTTP headers
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Rate limiting - separate for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Limit each IP to 50 login/register attempts per window
  message: 'Too many login attempts, please try again later',
});

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  message: 'Too many requests from this IP, please try again later',
});

// Body parser middleware
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', generalLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/policies', authMiddleware, policyRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/whitelist', authMiddleware, whitelistRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Handle 404 requests
app.use(notFound);

// Error handler middleware
app.use(errorHandler);

// Improve mongoose configuration
mongoose.set('strictQuery', true);

// Connect to MongoDB with improved error handling
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cloud-iam-sentinel', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
  })
  .then(() => {
    console.log('Connected to MongoDB');
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  
  // Close server gracefully
  server.close(() => {
    process.exit(1);
  });
});