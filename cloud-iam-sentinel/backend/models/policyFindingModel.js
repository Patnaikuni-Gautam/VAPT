const mongoose = require('mongoose');

const policyFindingSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    policyName: {
      type: String,
      required: true,
    },
    policyText: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
      enum: ['IAM', 'S3', 'Lambda'],
    },
    severity: {
      type: String,
      required: true,
      enum: ['Critical', 'High', 'Medium', 'Low'],
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Open', 'In Review', 'Whitelisted', 'Resolved'],
      default: 'Open',
    },
    isWhitelisted: {
      type: Boolean,
      default: false,
    },
    whitelistedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    whitelistReason: {
      type: String,
    },
    whitelistRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhitelistRule',
      default: null
    },
    detectedIssues: [{
      type: String,
      required: true,
    }],
    recommendation: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const PolicyFinding = mongoose.model('PolicyFinding', policyFindingSchema);

module.exports = PolicyFinding;