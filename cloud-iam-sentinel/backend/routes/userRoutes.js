const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const PolicyFinding = require('../models/policyFindingModel');

// All user management routes require admin privileges
router.use(adminMiddleware);

// Get all users
// GET /api/users
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Count total users
    const total = await User.countDocuments();
    
    // Get users with pagination, excluding password
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get a single user
// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get user's policy findings stats
    const policiesAnalyzed = await PolicyFinding.countDocuments({ user: id });
    const criticalIssues = await PolicyFinding.countDocuments({ user: id, severity: 'Critical' });
    const highIssues = await PolicyFinding.countDocuments({ user: id, severity: 'High' });
    
    return res.status(200).json({
      success: true,
      data: {
        user,
        stats: {
          policiesAnalyzed,
          criticalIssues,
          highIssues,
          totalIssues: policiesAnalyzed
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Update a user
// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, organization, role, active } = req.body;
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (organization !== undefined) user.organization = organization;
    if (role && (role === 'admin' || role === 'user')) user.role = role;
    if (active !== undefined) user.active = active;
    
    const updatedUser = await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        organization: updatedUser.organization,
        active: updatedUser.active,
        lastLogin: updatedUser.lastLogin,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating user:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Reset a user's password
// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Set new password
    user.password = newPassword;
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Error resetting password:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Delete a user
// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent deleting yourself
    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await user.remove();
    
    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get user statistics
// GET /api/users/stats
router.get('/stats/overview', async (req, res) => {
  try {
    // Count total users
    const totalUsers = await User.countDocuments();
    
    // Count active users
    const activeUsers = await User.countDocuments({ active: true });
    
    // Count admin users
    const adminUsers = await User.countDocuments({ role: 'admin' });
    
    // Count organizations (unique organization values)
    const organizations = await User.distinct('organization');
    const totalOrganizations = organizations.length;
    
    // Get recent users
    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);
    
    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        adminUsers,
        totalOrganizations,
        recentUsers
      }
    });
  } catch (error) {
    console.error('Error fetching user statistics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

module.exports = router;