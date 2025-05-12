const express = require('express');
const router = express.Router();
const { adminMiddleware, authMiddleware } = require('../middleware/authMiddleware');
const policyAnalyzer = require('../services/policyAnalyzer');
const PolicyFinding = require('../models/policyFindingModel');
const FalsePositiveFeedback = require('../models/falsePositiveFeedbackModel');
const WhitelistRule = require('../models/whitelistRuleModel');
const mongoose = require('mongoose');
const { handleError } = require('../utils/errorHandler');

/**
 * POLICY ANALYSIS ROUTES
 * Routes for analyzing individual and batch policies
 */

// Analyze a single policy
// POST /api/policies/analyze
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { policyText, policyName, policyType, saveAnalysis } = req.body;

    if (!policyText || !policyType) {
      return res.status(400).json({
        success: false,
        message: 'Policy text and type are required'
      });
    }

    // Run analysis on the policy
    const analysisResult = await policyAnalyzer.analyzeSinglePolicy(policyText, policyType);
    
    // Access the valid property directly from analysisResult
    if (!analysisResult.valid) {
      return res.status(400).json({
        success: false,
        message: analysisResult.error || 'Policy analysis failed'
      });
    }

    // Check both query param AND body parameter
    const shouldSave = req.query.save === 'true' || saveAnalysis === true;
    
    // Save findings to database if requested
    if (shouldSave) {
      const metadata = {
        policyName: policyName || 'Unnamed Policy',
        policyText,
        policyType
      };

      await policyAnalyzer.savePolicyAnalysisResults(analysisResult, metadata, req.user);
    }

    return res.status(200).json({
      success: true,
      saveStatus: shouldSave ? 'saved' : 'not saved',
      data: analysisResult  // Return analysisResult directly, not analysisResult.analysis
    });
  } catch (error) {
    console.error('Policy analysis error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze policy',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Analyze multiple policies in batch
// POST /api/policies/analyze/batch
router.post('/analyze/batch', authMiddleware, async (req, res) => {
  try {
    const { policies, saveAnalysis: bodySaveAnalysis } = req.body;
    const saveAnalysis = req.query.save === 'true' || bodySaveAnalysis === true;

    if (!Array.isArray(policies) || policies.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of policies to analyze'
      });
    }

    // Process each policy
    const results = [];
    let totalCritical = 0;
    let totalHigh = 0;
    let totalMedium = 0;
    let totalLow = 0;
    let totalPositives = 0;

    for (const policy of policies) {
      if (!policy.policyText || !policy.policyType) {
        results.push({
          policyName: policy.policyName || 'Unnamed Policy',
          valid: false,
          error: 'Policy text and type are required',
          issues: []
        });
        continue;
      }

      try {
        const analysisResult = await policyAnalyzer.analyzeSinglePolicy(
          policy.policyText, 
          policy.policyType
        );

        // Save to database if requested
        if (saveAnalysis) {
          const metadata = {
            policyName: policy.policyName || 'Unnamed Policy',
            policyText: policy.policyText,
            policyType: policy.policyType
          };
          await policyAnalyzer.savePolicyAnalysisResults(analysisResult, metadata, req.user);
        }

        // Add to results
        results.push({
          policyName: policy.policyName || 'Unnamed Policy',
          policyType: policy.policyType,
          ...analysisResult
        });

        // Aggregate statistics
        if (analysisResult.valid) {
          totalCritical += analysisResult.stats.critical;
          totalHigh += analysisResult.stats.high;
          totalMedium += analysisResult.stats.medium;
          totalLow += analysisResult.stats.low;
          totalPositives += analysisResult.stats.positive;
        }
      } catch (err) {
        results.push({
          policyName: policy.policyName || 'Unnamed Policy',
          valid: false,
          error: err.message || 'Analysis failed',
          issues: []
        });
      }
    }

    // Determine overall risk level
    let overallRisk = 'Low';
    if (totalCritical > 0) {
      overallRisk = 'Critical';
    } else if (totalHigh > 0) {
      overallRisk = 'High';
    } else if (totalMedium > 0) {
      overallRisk = 'Medium';
    }

    return res.status(200).json({
      success: true,
      data: {
        results,
        summary: {
          totalPolicies: policies.length,
          validPolicies: results.filter(r => r.valid).length,
          overallRisk,
          stats: {
            critical: totalCritical,
            high: totalHigh,
            medium: totalMedium,
            low: totalLow,
            positive: totalPositives,
            total: totalCritical + totalHigh + totalMedium + totalLow
          }
        }
      }
    });
  } catch (error) {
    console.error('Batch policy analysis error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze policies in batch',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * POLICY FINDINGS ROUTES
 * Routes for managing policy findings
 */

// Get all policy findings for current user
// GET /api/policies/findings
router.get('/findings', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query filter
    const query = {};
    
    // If admin param is true and user is admin, don't filter by user
    if (!(req.query.admin === 'true' && req.user.role === 'admin')) {
      query.user = req.user._id;
    }
    
    // Apply severity filter if provided
    if (req.query.severity) {
      query.severity = req.query.severity;
    }
    
    // Apply service filter if provided
    if (req.query.service) {
      query.service = req.query.service;
    }
    
    // Apply status filter if provided
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    console.log('Findings query:', JSON.stringify(query, null, 2));
    
    const findings = await PolicyFinding.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await PolicyFinding.countDocuments(query);
    
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
    console.error('Error fetching findings:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch findings',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Update policy finding status
// PUT /api/policies/findings/:id/status
router.put('/findings/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid finding ID is required'
      });
    }
    
    if (!['Open', 'In Review', 'Resolved', 'Whitelisted'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    const finding = await PolicyFinding.findById(id);
    
    if (!finding) {
      return res.status(404).json({
        success: false,
        message: 'Finding not found'
      });
    }
    
    // Check permissions
    if (req.user.role !== 'admin' && finding.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this finding'
      });
    }
    
    // Update the finding
    finding.status = status;
    finding.lastUpdatedBy = req.user._id;
    finding.updatedAt = Date.now();
    
    // If marking as whitelisted, update related fields
    if (status === 'Whitelisted') {
      finding.isWhitelisted = true;
      finding.whitelistedBy = req.user._id;
      finding.whitelistReason = reason || 'Approved by administrator';
    }
    
    await finding.save();
    
    return res.status(200).json({
      success: true,
      data: finding
    });
  } catch (error) {
    console.error('Error updating finding status:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update finding status',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * FALSE POSITIVE FEEDBACK ROUTES
 * Routes for handling false positive reports and feedback
 */

// Submit false positive feedback
// POST /api/policies/feedback
router.post('/feedback', authMiddleware, async (req, res) => {
  try {
    const { findingId, reason } = req.body;
    
    if (!findingId || !mongoose.Types.ObjectId.isValid(findingId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid finding ID is required'
      });
    }
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }
    
    // Find the policy finding
    const finding = await PolicyFinding.findById(findingId);
    
    if (!finding) {
      return res.status(404).json({
        success: false,
        message: 'Finding not found'
      });
    }
    
    // Check if feedback already exists
    const existingFeedback = await FalsePositiveFeedback.findOne({
      findingId,
      user: req.user._id
    });
    
    if (existingFeedback) {
      // If feedback already exists, update it instead of creating a new one
      console.log(`Updating existing feedback for finding ${findingId}`);
      
      existingFeedback.reason = reason;
      existingFeedback.updatedAt = new Date();
      existingFeedback.updateCount = (existingFeedback.updateCount || 0) + 1;
      existingFeedback.lastUpdateReason = `Updated by user on ${new Date().toISOString()}`;
      await existingFeedback.save();
      
      // If finding is not already in review, update its status
      if (finding.status !== 'In Review') {
        finding.status = 'In Review';
        finding.statusReason = `False positive reported: ${reason}`;
        finding.lastUpdatedBy = req.user._id;
        finding.updatedAt = new Date();
        await finding.save();
      }
      
      return res.status(200).json({
        success: true,
        message: 'False positive report updated successfully',
        data: { feedback: existingFeedback, finding }
      });
    }
    
    // Create feedback entry
    const feedback = new FalsePositiveFeedback({
      user: req.user._id,
      findingId,
      policyName: finding.policyName,
      service: finding.service,
      originalSeverity: finding.severity,
      reason
    });
    
    await feedback.save();
    
    // Update finding status
    finding.status = 'In Review';
    finding.statusReason = `False positive reported: ${reason}`;
    finding.lastUpdatedBy = req.user._id;
    finding.updatedAt = new Date();
    
    await finding.save();
    
    return res.status(200).json({
      success: true,
      message: 'False positive reported successfully',
      data: { feedback, finding }
    });
  } catch (error) {
    // Provide more helpful message for duplicate key errors
    if (error.code === 11000) {
      console.warn('Duplicate false positive report attempted:', error.keyValue);
      return res.status(409).json({
        success: false,
        message: 'You have already reported this finding as a false positive. Please wait for admin review.',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
    
    return res.status(500).json(
      handleError(error, 'submit false positive feedback')
    );
  }
});

// Get all false positive feedback - Admin only
// GET /api/policies/feedback
router.get('/feedback', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Additional query filters
    const query = {};
    
    // Add status filter if provided
    if (req.query.status) {
      if (req.query.status === 'pending') {
        query.isApproved = null; // Only pending reports
      } else if (req.query.status === 'approved') {
        query.isApproved = true; // Only approved reports
      } else if (req.query.status === 'rejected') {
        query.isApproved = false; // Only rejected reports
      }
    }
    
    const total = await FalsePositiveFeedback.countDocuments(query);
    
    // Include updatedAt in sort criteria to show recently updated items
    const feedback = await FalsePositiveFeedback.find(query)
      .populate('user', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ updatedAt: -1 }) // Sort by last updated first
      .skip(skip)
      .limit(limit);
    
    return res.status(200).json({
      success: true,
      data: {
        feedback,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Approve/reject false positive feedback - Admin only
// PUT /api/policies/feedback/:id
router.put('/feedback/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved, reason } = req.body;
    
    if (typeof isApproved !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isApproved must be a boolean value'
      });
    }
    
    // First, find the feedback document
    const feedback = await FalsePositiveFeedback.findById(id);
    
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }
    
    // Then find the associated finding using findingId field
    const finding = await PolicyFinding.findById(feedback.findingId);
    
    if (!finding) {
      return res.status(404).json({
        success: false,
        message: 'Associated finding not found'
      });
    }
    
    // Update feedback status
    feedback.isApproved = isApproved;
    feedback.approvedBy = req.user._id;
    feedback.approvedAt = new Date();
    await feedback.save();
    
    if (isApproved) {
      // Use smart pattern creation instead of basic regex escaping
      const pattern = policyAnalyzer.createSmartPattern(finding);
      
      console.log('Created smart pattern from description:', pattern);
      
      const whitelistRule = new WhitelistRule({
        pattern,
        description: finding.policyName || finding.description,
        service: finding.service,
        severity: finding.severity,
        reason: reason || 'Approved false positive',
        createdBy: req.user._id,
        sourceType: 'feedback',
        sourceFeedbackId: feedback._id,
        sourceFindingId: finding._id
      });
      
      await whitelistRule.save();
      
      // Update the finding with reference to the whitelist rule
      finding.isWhitelisted = true;
      finding.status = 'Whitelisted';
      finding.whitelistedBy = req.user._id;
      finding.whitelistReason = reason || 'Approved false positive';
      finding.whitelistRuleId = whitelistRule._id;  // Add this reference
      finding.lastUpdatedBy = req.user._id;
      finding.updatedAt = new Date();
      
      await finding.save();
      
      // Rest of your code...
    } else {
      // Reject the false positive
      finding.status = 'Open';
      finding.statusReason = `False positive rejected: ${reason || 'Not specified'}`;
      finding.lastUpdatedBy = req.user._id;
      finding.updatedAt = Date.now();
      
      await finding.save();
      
      return res.status(200).json({
        success: true,
        message: 'False positive rejected successfully',
        data: { finding }
      });
    }
  } catch (error) {
    console.error('Error updating feedback:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update feedback',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * POLICY STATISTICS ROUTES
 * Routes for fetching policy statistics and insights
 */

// Get policy statistics for the current user
// GET /api/policies/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Count total policies analyzed
    const totalPolicies = await PolicyFinding.countDocuments({ user: userId });
    
    // Count issues by severity (excluding whitelisted)
    const criticalIssues = await PolicyFinding.countDocuments({ 
      user: userId, severity: 'Critical', isWhitelisted: false
    });
    
    const highIssues = await PolicyFinding.countDocuments({ 
      user: userId, severity: 'High', isWhitelisted: false
    });
    
    const mediumIssues = await PolicyFinding.countDocuments({ 
      user: userId, severity: 'Medium', isWhitelisted: false
    });
    
    const lowIssues = await PolicyFinding.countDocuments({ 
      user: userId, severity: 'Low', isWhitelisted: false
    });
    
    // Get most recent scan date
    const latestFinding = await PolicyFinding.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select('createdAt');
    
    return res.status(200).json({
      success: true,
      data: {
        policiesAnalyzed: totalPolicies,
        issuesFound: criticalIssues + highIssues + mediumIssues + lowIssues,
        criticalIssues,
        highIssues,
        mediumIssues,
        lowIssues,
        lastScanDate: latestFinding ? latestFinding.createdAt : null
      }
    });
  } catch (error) {
    console.error('Error fetching policy statistics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch policy statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get policy insights
// GET /api/policies/insights
router.get('/insights', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get issues grouped by service
    const issuesByService = await PolicyFinding.aggregate([
      { $match: { user: userId, isWhitelisted: false } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $project: { service: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);
    
    // Get issues grouped by severity
    const issuesBySeverity = await PolicyFinding.aggregate([
      { $match: { user: userId, isWhitelisted: false } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $project: { severity: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);
    
    // Get issue trend over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get dates for the last 30 days
    const dates = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });
    
    // Get issue trend data
    const trendResults = await PolicyFinding.aggregate([
      { 
        $match: { 
          user: userId,
          isWhitelisted: false,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            severity: '$severity'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          severities: {
            $push: {
              severity: '$_id.severity',
              count: '$count'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Format trend data
    const issuesTrend = dates.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayData = trendResults.find(d => d._id === dateStr);
      
      return {
        date: dateStr,
        critical: dayData?.severities.find(s => s.severity === 'Critical')?.count || 0,
        high: dayData?.severities.find(s => s.severity === 'High')?.count || 0,
        medium: dayData?.severities.find(s => s.severity === 'Medium')?.count || 0,
        low: dayData?.severities.find(s => s.severity === 'Low')?.count || 0,
      };
    });
    
    // Get top issues by frequency
    const topIssues = await PolicyFinding.aggregate([
      { $match: { user: userId, isWhitelisted: false } },
      { 
        $group: {
          _id: '$description',
          count: { $sum: 1 },
          severity: { $first: '$severity' }
        }
      },
      { $project: { description: '$_id', count: 1, severity: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get recent policies
    const recentPolicies = await PolicyFinding.aggregate([
      { $match: { user: userId } },
      { $sort: { createdAt: -1 } },
      { 
        $group: {
          _id: '$policyName',
          service: { $first: '$service' },
          createdAt: { $first: '$createdAt' },
          findings: { $push: { severity: '$severity', isWhitelisted: '$isWhitelisted' } }
        }
      },
      { 
        $project: {
          policyName: '$_id',
          service: 1,
          date: '$createdAt',
          _id: 0,
          issues: { $size: '$findings' },
          riskLevel: {
            $cond: {
              if: { $gt: [{ $size: { $filter: { 
                input: '$findings', 
                as: 'f', 
                cond: { $and: [
                  { $eq: ['$$f.severity', 'Critical'] }, 
                  { $eq: ['$$f.isWhitelisted', false] }
                ]} 
              } } }, 0] },
              then: 'Critical',
              else: {
                $cond: {
                  if: { $gt: [{ $size: { $filter: { 
                    input: '$findings', 
                    as: 'f', 
                    cond: { $and: [
                      { $eq: ['$$f.severity', 'High'] }, 
                      { $eq: ['$$f.isWhitelisted', false] }
                    ]} 
                  } } }, 0] },
                  then: 'High',
                  else: {
                    $cond: {
                      if: { $gt: [{ $size: { $filter: { 
                        input: '$findings', 
                        as: 'f', 
                        cond: { $and: [
                          { $eq: ['$$f.severity', 'Medium'] }, 
                          { $eq: ['$$f.isWhitelisted', false] }
                        ]} 
                      } } }, 0] },
                      then: 'Medium',
                      else: 'Low'
                    }
                  }
                }
              }
            }
          }
        }
      },
      { $sort: { date: -1 } },
      { $limit: 10 }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        issuesByService,
        issuesBySeverity,
        issuesTrend,
        topIssues,
        recentPolicies
      }
    });
  } catch (error) {
    console.error('Error fetching policy insights:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch policy insights',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Get service-specific statistics
// GET /api/policies/stats/services
router.get('/stats/services', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get issues grouped by service
    const serviceStats = await PolicyFinding.aggregate([
      { $match: { user: userId, isWhitelisted: false } },
      { 
        $group: { 
          _id: '$service', 
          count: { $sum: 1 } 
        }
      },
      { 
        $project: {
          name: '$_id',
          issues: '$count',
          _id: 0
        }
      },
      { $sort: { issues: -1 } }
    ]);
    
    // Calculate percentages
    const totalIssues = serviceStats.reduce((total, service) => total + service.issues, 0);
    
    const servicesWithPercentage = serviceStats.map(service => ({
      ...service,
      percentage: totalIssues > 0 
        ? Math.round((service.issues / totalIssues) * 100) 
        : 0
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        services: servicesWithPercentage
      }
    });
  } catch (error) {
    console.error('Error fetching service statistics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch service statistics',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * FALSE POSITIVE ROUTES WITH MODULAR ANALYZER
 * Routes for reporting and managing false positives using the modular analyzer
 */

// Report a false positive
// POST /api/policies/false-positive
router.post('/false-positive', authMiddleware, async (req, res) => {
  try {
    const { finding, description, severity, reason, policyType } = req.body;

    if (!finding || !severity || !policyType) {
      return res.status(400).json({
        success: false,
        message: 'Finding ID, severity, and policy type are required'
      });
    }

    // Create false positive report
    const reportData = { finding, description, severity, reason, policyType };
    const feedback = await policyAnalyzer.reportFalsePositive(reportData, req.user);

    return res.status(201).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('False positive reporting error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to report false positive',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Approve a false positive finding directly - Admin only
// PATCH /api/policies/false-positive/:id/approve
router.patch('/false-positive/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    
    console.log(`Approving false positive ${id} with notes: ${notes || 'None'}`);
    
    // Validate the ID first
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid finding ID is required'
      });
    }
    
    // Process the false positive report using the updated analyzer
    const result = await policyAnalyzer.processFalsePositiveReport(id, true, notes, req.user);
    
    if (!result || !result.success) {
      console.error('Failed to process false positive:', result);
      throw new Error('Failed to process false positive report');
    }
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error approving false positive:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve false positive',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Reject a false positive finding directly - Admin only
// PATCH /api/policies/false-positive/:id/reject
router.patch('/false-positive/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    
    console.log(`Rejecting false positive ${id} with notes: ${notes || 'None'}`);
    
    // Process the false positive report using the updated analyzer
    const result = await policyAnalyzer.processFalsePositiveReport(id, false, notes, req.user);
    
    if (!result || !result.success) {
      console.error('Failed to process false positive:', result);
      throw new Error('Failed to process false positive report');
    }
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error rejecting false positive:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject false positive',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

// Add a cache-busting timestamp to prevent caching
router.get('/findings/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`Fetching stats for user: ${userId} at ${new Date().toISOString()}`);
    
    // Rest of the function...
  } catch (error) {
    // Error handling...
  }
});

module.exports = router;