  require("dotenv").config();
  const express = require("express");
  const connectDB = require("./config/db");
  const cors = require("cors");
  const helmet = require("helmet");
  const rateLimit = require("express-rate-limit");

  const authRoutes = require("./routes/authRoutes");

  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  });
  app.use(limiter);

  // Connect to MongoDB
  connectDB();

  // Routes
  app.use("/api/auth", authRoutes);

  app.get("/", (req, res) => {
    res.send("Cloud IAM Sentinel Backend Running!");
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));