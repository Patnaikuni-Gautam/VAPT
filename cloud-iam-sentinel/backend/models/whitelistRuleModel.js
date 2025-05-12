const mongoose = require('mongoose');

const whitelistRuleSchema = new mongoose.Schema({
  pattern: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  service: {
    type: String,
    required: true,
    trim: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['Critical', 'High', 'Medium', 'Low']
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sourceType: {
    type: String,
    enum: ['manual', 'feedback'],
    required: true
  },
  sourceFeedbackId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FalsePositiveFeedback',
    required: false
  },
  matchCount: {
    type: Number,
    default: 0
  },
  lastMatchedAt: {
    type: Date,
    default: null
  },
  sourceFindingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PolicyFinding'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for better performance
whitelistRuleSchema.index({ pattern: 1 });
whitelistRuleSchema.index({ service: 1, severity: 1 });

const WhitelistRule = mongoose.model('WhitelistRule', whitelistRuleSchema);

module.exports = WhitelistRule;