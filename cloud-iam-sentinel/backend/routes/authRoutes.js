const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Register a new user
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, organization } = req.body;

    // Check if required fields are provided
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and password'
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user (password hashing is handled in the model)
    const user = await User.create({
      name,
      email,
      password,
      organization: organization || '',
      role: 'user' // Default role is user
    });

    if (user) {
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user data'
      });
    }
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Modify the login route to include better token handling
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if required fields are provided
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Check password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login timestamp
    user.lastLogin = Date.now();
    await user.save();

    // Generate JWT token with more appropriate expiration
    const expiresIn = '24h';
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion || 0 // Track token version to invalidate old sessions
      }, 
      process.env.JWT_SECRET, 
      { expiresIn }
    );

    // Calculate expiration date for client reference
    const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Set token as cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    // Return user data without password
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        tokenExpires: expirationDate,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: user.organization
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Log out a user
// POST /api/auth/logout
router.post('/logout', (req, res) => {
  try {
    // Clear the JWT cookie
    res.clearCookie('jwt');
    
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to logout',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Add a route to refresh the token
router.post('/refresh-token', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    // Generate new JWT token
    const expiresIn = '24h';
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion || 0
      }, 
      process.env.JWT_SECRET, 
      { expiresIn }
    );

    // Calculate expiration date
    const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Set token as cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: {
        token,
        tokenExpires: expirationDate,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: user.organization
        }
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Add a logout-all route for security purposes
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Increment token version to invalidate all existing tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    
    // Clear the current cookie
    res.clearCookie('jwt', { 
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    return res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully'
    });
  } catch (error) {
    console.error('Logout all error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to logout from all devices',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get current user profile
// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  // Make sure we're sending JSON response
  try {
    if (req.user) {
      // Remove sensitive data before sending
      const userResponse = {
        _id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        createdAt: req.user.createdAt
      };

      return res.status(200).json({
        success: true,
        user: userResponse
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
  } catch (error) {
    console.error('Error in /auth/me endpoint:', error);
    return res.status(500).json({
      success: false, 
      message: 'Internal server error'
    });
  }
});

// Update current user profile
// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, organization, currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Update name if provided
    if (name) {
      user.name = name;
    }
    
    // Update organization if provided
    if (organization !== undefined) {
      user.organization = organization;
    }
    
    // Update password if provided
    if (currentPassword && newPassword) {
      // Verify current password
      const isPasswordValid = await user.matchPassword(currentPassword);
      
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Set new password
      user.password = newPassword;
    }
    
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization
      }
    });
  } catch (error) {
    console.error('Profile update error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Admin: Create a new user
// POST /api/auth/users
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, email, password, organization, role } = req.body;

    // Check if required fields are provided
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and password'
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
      organization: organization || '',
      role: role === 'admin' ? 'admin' : 'user'
    });

    if (user) {
      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user data'
      });
    }
  } catch (error) {
    console.error('User creation error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

module.exports = router;