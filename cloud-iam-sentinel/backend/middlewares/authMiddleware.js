const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if the session cookie is still valid
    if (!req.session?.authenticated) {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);

    // Handle JWT errors
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }

    return res.status(401).json({
      message: error.name === "JsonWebTokenError" ? "Invalid token" : "Authentication error"
    });
  }
};

module.exports = authMiddleware;
