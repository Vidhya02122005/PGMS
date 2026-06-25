const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  userRole: { 
    type: String, 
    enum: ['admin', 'user'], 
    required: true 
  },
  userEmail: { 
    type: String 
  },
  actionType: { 
    type: String, 
    required: true,
    enum: [
      'page_view', 'login', 'logout',
      'view_dashboard', 'view_attendance', 'mark_attendance',
      'create_complaint', 'view_complaint', 'update_complaint',
      'create_payment', 'view_payment',
      'view_room', 'book_room',
      'view_meal_plan', 'order_meal',
      'send_notification', 'view_notification',
      'register_user', 'update_profile'
    ]
  },
  page: { type: String },
  endpoint: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  responseTime: { type: Number },
  metadata: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now }
});

// Indexes for faster queries
analyticsSchema.index({ timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ userRole: 1, timestamp: -1 });
analyticsSchema.index({ actionType: 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);