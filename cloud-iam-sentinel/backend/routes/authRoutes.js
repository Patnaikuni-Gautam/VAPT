const express = require("express");
const router = express.Router();
const { registerUser, loginUser, verifyUser, logoutUser } = require("../controllers/authController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/verify", verifyUser);
router.post("/logout", logoutUser);

module.exports = router;
