require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");

const app = express();
connectDB();

// Middleware
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Session setup: make sure the session expires based on tab close behavior
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,  // This ensures the session cookie is updated with every request
  cookie: {
    secure: process.env.NODE_ENV === "production",  // Ensure the cookie is only sent over HTTPS in production
    httpOnly: true,  // Prevent access to the cookie via JavaScript
    sameSite: "strict",  // Mitigate CSRF attacks
    expires: false,  // This makes the session expire when the browser/tab is closed
  }
}));

// CORS
const allowedOrigins = ["http://localhost:3001"];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", limiter);

// Routes
app.get("/", (req, res) => res.json({ message: "Cloud IAM Sentinel API is running" }));
app.get("/health", (req, res) => res.status(200).json({ status: "healthy" }));
app.use("/api/auth", authRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Error Handler
app.use((err, req, res, next) => {
  console.error("Internal Server Error:", err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
