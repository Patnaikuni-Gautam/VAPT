const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = new User({ name, email, password });
    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Set session cookie behavior based on "Remember Me"
    const rememberMe = remember === true || remember === "true";

    // Generate token
    const tokenPayload = { userId: user._id, name: user.name };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET); // No expiry for JWT, as we manage session expiration through cookies

    // Session setup
    req.session.authenticated = true;
    req.session.userId = user._id;

    // No expiration for session cookies, browser/tab close will end the session
    req.session.cookie.expires = false; // This will make it a session cookie (will expire on tab/browser close)

    // Cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    };

    if (rememberMe) {
      // If Remember Me is selected, the session cookie will persist across browser restarts
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      cookieOptions.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    }

    // Set the token as an HTTP-only cookie
    res.cookie("token", token, cookieOptions);

    res.status(200).json({
      message: "Login successful",
      user: { name: user.name, email: user.email }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

const verifyUser = async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!req.session?.authenticated) {
      res.clearCookie("token");
      return res.status(401).json({ message: "Session expired" });
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });

    res.json({ user });
  } catch (error) {
    console.error("Verify Error:", error);
    res.clearCookie("token");
    res.status(401).json({ message: "Invalid token" });
  }
};

const logoutUser = (req, res) => {
  req.session?.destroy(() => {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    });
    res.json({ message: "Logged out successfully" });
  });
};

module.exports = {
  registerUser,
  loginUser,
  verifyUser,
  logoutUser
};
