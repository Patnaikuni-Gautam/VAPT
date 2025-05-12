const express = require('express');
const router = express.Router();
const { adminMiddleware, authMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const PolicyFinding = require('../models/policyFindingModel');
const FalsePositiveFeedback = require('../models/falsePositiveFeedbackModel');

// All admin routes require admin privileges
router.use(authMiddleware, adminMiddleware);

// Get admin dashboard stats
// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    // Count users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });
    
    // Count policies
    const totalPoliciesAnalyzed = await PolicyFinding.countDocuments();
    
    // Count issues by severity
    const criticalIssues = await PolicyFinding.countDocuments({ 
      severity: 'Critical',
      isWhitelisted: false
    });
    
    const highIssues = await PolicyFinding.countDocuments({ 
      severity: 'High',
      isWhitelisted: false
    });
    
    const mediumIssues = await PolicyFinding.countDocuments({ 
      severity: 'Medium',
      isWhitelisted: false
    });
    
    const lowIssues = await PolicyFinding.countDocuments({ 
      severity: 'Low',
      isWhitelisted: false
    });
    
    // Count whitelist rules
    const activeWhitelistRules = await FalsePositiveFeedback.countDocuments({
      isApproved: true
    });
    
    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalPoliciesAnalyzed,
        totalIssuesFound: criticalIssues + highIssues + mediumIssues + lowIssues,
        criticalIssues,
        highIssues,
        mediumIssues,
        lowIssues,
        activeWhitelistRules
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get admin findings
// GET /api/admin/findings
router.get('/findings', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // For admin, get all findings regardless of user
    const findings = await PolicyFinding.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await PolicyFinding.countDocuments({});
    
    return res.status(200).json({
      success: true,
      data: {
        findings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin findings:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin findings',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

module.exports = router;