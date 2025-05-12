const mongoose = require('mongoose');

const falsePositiveFeedbackSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    findingId: {
      type: String,
      required: true,
    },
    policyName: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
      enum: ['IAM', 'S3', 'Lambda', 'CloudWatch', 'EC2'],
    },
    originalSeverity: {
      type: String,
      required: true,
      enum: ['Critical', 'High', 'Medium', 'Low'],
    },
    reason: {
      type: String,
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    updateCount: {
      type: Number,
      default: 0
    },
    lastUpdateReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// Create a compound index to prevent duplicate submissions
falsePositiveFeedbackSchema.index({ findingId: 1, user: 1 }, { unique: true });

const FalsePositiveFeedback = mongoose.model('FalsePositiveFeedback', falsePositiveFeedbackSchema);

module.exports = FalsePositiveFeedback;