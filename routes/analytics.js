const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');

// Middleware to check authentication (adjust based on your auth)
const isAuthenticated = (req, res, next) => {
  // Replace with your actual auth check
  if (req.user || req.session?.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Get analytics dashboard data (role-based)
router.get('/dashboard-data', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const userRole = req.user?.role || req.session?.role;
    
    const now = new Date();
    const last7Days = new Date(now.setDate(now.getDate() - 7));
    
    if (userRole === 'admin') {
      // Admin sees all data
      const [totalUsers, totalComplaints, totalPayments, pageViews] = await Promise.all([
        Analytics.distinct('userId', { timestamp: { $gte: last7Days } }),
        Analytics.countDocuments({ actionType: 'create_complaint', timestamp: { $gte: last7Days } }),
        Analytics.countDocuments({ actionType: 'create_payment', timestamp: { $gte: last7Days } }),
        Analytics.aggregate([
          { $match: { timestamp: { $gte: last7Days } } },
          { $group: { _id: '$page', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ])
      ]);
      
      res.json({
        role: 'admin',
        summary: {
          activeUsers: totalUsers.length,
          totalComplaints: totalComplaints,
          totalPayments: totalPayments,
          topPages: pageViews
        }
      });
    } else {
      // User sees only their data
      const [myActivities, myComplaints, myPayments] = await Promise.all([
        Analytics.find({ userId, timestamp: { $gte: last7Days } })
          .sort({ timestamp: -1 })
          .limit(20),
        Analytics.countDocuments({ userId, actionType: 'create_complaint', timestamp: { $gte: last7Days } }),
        Analytics.countDocuments({ userId, actionType: 'create_payment', timestamp: { $gte: last7Days } })
      ]);
      
      res.json({
        role: 'user',
        summary: {
          recentActivity: myActivities,
          totalComplaints: myComplaints,
          totalPayments: myPayments
        }
      });
    }
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Track custom events (for frontend tracking)
router.post('/track', isAuthenticated, async (req, res) => {
  try {
    const { actionType, metadata } = req.body;
    const userId = req.user?._id || req.session?.userId;
    const userRole = req.user?.role || req.session?.role;
    const userEmail = req.user?.email || req.session?.email;
    
    await Analytics.create({
      userId,
      userRole,
      userEmail,
      actionType,
      page: req.headers.referer || req.body.page,
      metadata: metadata || {},
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user activity timeline
router.get('/my-activity', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const activities = await Analytics.find({ userId })
      .sort({ timestamp: -1 })
      .limit(50);
    
    res.json({ activities });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;