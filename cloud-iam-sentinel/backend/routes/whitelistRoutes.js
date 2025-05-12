const express = require('express');
const router = express.Router();
const { adminMiddleware, authMiddleware } = require('../middleware/authMiddleware');
const PolicyFinding = require('../models/policyFindingModel');
const FalsePositiveFeedback = require('../models/falsePositiveFeedbackModel');
const WhitelistRule = require('../models/whitelistRuleModel');
const mongoose = require('mongoose');

// All routes here require admin privileges
router.use(adminMiddleware);

// Get all whitelist rules
// GET /api/whitelist
router.get('/', async (req,res) => {
  try {
    const whitelistItems = await WhitelistRule.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    return res.status(200).json({
      success: true,
      data: {
        whitelistItems,
      }
    });
  } catch (error) {
    console.error('Error fetching whitelist:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch whitelist',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Add a rule to whitelist
// POST /api/whitelist
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('Creating whitelist rule with data:', req.body);
    
    const { pattern, description, service, severity, reason } = req.body;
    
    // Better validation
    if (!pattern || !description || !service || !severity || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Pattern, description, service, severity, and reason are all required'
      });
    }
    
    // Validate the pattern to make sure it's a valid regex
    try {
      new RegExp(pattern);
    } catch (regexError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid regex pattern: ' + regexError.message
      });
    }
    
    // Validate service and severity against allowed values
    const validServices = ['IAM', 'S3', 'Lambda', 'EC2', 'RDS', 'Other'];
    const validSeverities = ['Critical', 'High', 'Medium', 'Low'];
    
    if (!validServices.includes(service)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service. Must be one of: ${validServices.join(', ')}`
      });
    }
    
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`
      });
    }
    
    // Create a new whitelist rule
    const whitelistRule = new WhitelistRule({
      pattern,
      description,
      service,
      severity,
      reason,
      createdBy: req.user._id,
      sourceType: 'manual',
      matchCount: 0,
      lastMatchedAt: null
    });
    
    await whitelistRule.save();
    
    // Also create FalsePositiveFeedback for backward compatibility
    const feedback = new FalsePositiveFeedback({
      user: req.user._id,
      findingId: 'whitelist-rule',
      policyName: description,
      service,
      originalSeverity: severity,
      reason,
      pattern,
      isApproved: true,
      approvedBy: req.user._id,
      approvedAt: new Date(),
      isWhitelistRule: true
    });
    
    await feedback.save();
    
    // Find and update any existing findings that match this pattern
    let matchQuery = {};
    
    // Match by service and severity
    matchQuery.service = service;
    matchQuery.severity = severity;
    
    try {
      // Use the pattern to find matching descriptions
      const regex = new RegExp(pattern);
      matchQuery.description = { $regex: regex };
    } catch (err) {
      console.warn('Could not use pattern as regex for matching findings:', err.message);
    }
    
    // Update matching findings
    const updateResult = await PolicyFinding.updateMany(
      matchQuery,
      {
        isWhitelisted: true,
        status: 'Whitelisted',
        whitelistedBy: req.user._id,
        whitelistReason: reason
      }
    );
    
    return res.status(200).json({
      success: true,
      message: `Whitelist rule created. ${updateResult.modifiedCount || 0} existing findings updated.`,
      data: {
        rule: whitelistRule,
        affectedFindings: updateResult.modifiedCount || 0
      }
    });
  } catch (error) {
    console.error('Error creating whitelist rule:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create whitelist rule',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Remove a rule from whitelist
// DELETE /api/whitelist/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Deleting whitelist rule: ${id}`);
    
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(id);
    } catch (idError) {
      console.error(`Invalid ObjectId format: ${id}`, idError);
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }
    
    // Find the whitelist rule
    const whitelistRule = await WhitelistRule.findById(objectId);
    
    if (!whitelistRule) {
      return res.status(404).json({
        success: false,
        message: 'Whitelist rule not found'
      });
    }
    
    console.log('Found whitelist rule to delete:', {
      id: whitelistRule._id,
      description: whitelistRule.description,
      pattern: whitelistRule.pattern
    });
    
    // Remove the whitelist flag from matching policy findings
    const findingsQuery = {
      service: whitelistRule.service,
      severity: whitelistRule.severity,
      isWhitelisted: true
    };
    
    // If pattern exists, match by pattern
    if (whitelistRule.pattern) {
      try {
        findingsQuery.description = { $regex: new RegExp(whitelistRule.pattern) };
      } catch (err) {
        console.warn('Invalid regex pattern, falling back to exact match');
        findingsQuery.description = whitelistRule.description;
      }
    }
    
    const updateResult = await PolicyFinding.updateMany(
      findingsQuery,
      {
        isWhitelisted: false,
        status: 'Open',
        $unset: { whitelistedBy: "", whitelistReason: "" }
      }
    );
    
    console.log(`Updated ${updateResult.modifiedCount} findings`);
    
    // Delete the whitelist rule
    await WhitelistRule.findByIdAndDelete(objectId);
    
    // If this was from a feedback, try to delete the feedback too
    if (whitelistRule.sourceType === 'feedback' && whitelistRule.sourceFeedbackId) {
      try {
        await FalsePositiveFeedback.findByIdAndDelete(whitelistRule.sourceFeedbackId);
      } catch (err) {
        console.warn('Could not delete associated feedback:', err.message);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Whitelist rule removed successfully',
      data: {
        modifiedFindings: updateResult.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error removing whitelist rule:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove whitelist rule',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get whitelist statistics
// GET /api/whitelist/stats
router.get('/stats', async (req, res) => {
  try {
    // Get service stats for whitelist rules
    const serviceStats = await WhitelistRule.aggregate([
      { $group: { _id: '$service', count: { $sum: 1 } } }
    ]);
    
    // Get severity stats for whitelist rules
    const severityStats = await WhitelistRule.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);
    
    // Count total whitelist rules
    const totalRules = await WhitelistRule.countDocuments();
    
    return res.status(200).json({
      success: true,
      data: {
        totalRules,
        byService: serviceStats.map(item => ({ service: item._id, count: item.count })),
        bySeverity: severityStats.map(item => ({ severity: item._id, count: item.count }))
      }
    });
  } catch (error) {
    console.error('Error fetching whitelist statistics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch whitelist statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// GET /api/whitelist/stats/matches
router.get('/stats/matches', adminMiddleware, async (req, res) => {
  try {
    // Get rules with the most matches
    const mostMatchedRules = await WhitelistRule.find()
      .sort({ matchCount: -1 })
      .limit(10)
      .populate('createdBy', 'name email');
    
    // Get most recently matched rules
    const recentlyMatchedRules = await WhitelistRule.find({ 
      lastMatchedAt: { $ne: null } 
    })
      .sort({ lastMatchedAt: -1 })
      .limit(10)
      .populate('createdBy', 'name email');
    
    return res.status(200).json({
      success: true,
      data: {
        mostMatchedRules,
        recentlyMatchedRules
      }
    });
  } catch (error) {
    console.error('Error fetching whitelist match statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch whitelist match statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

module.exports = router;