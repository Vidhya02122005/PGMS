const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkIn: {
    type: Date,
    default: null
  },
  checkOut: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half Day'],
    default: 'Present'
  },
  mealTaken: {
    type: String,
    enum: ['Breakfast', 'Lunch', 'Dinner', 'None'],
    default: 'None'
  },
  faceVerified: {
    type: Boolean,
    default: false
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
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

// Indexes for faster queries
attendanceSchema.index({ user: 1, date: -1 });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ user: 1, checkIn: -1 });

// Pre-save middleware to update timestamps
attendanceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ===== STATIC METHODS =====

// Get attendance for a user
attendanceSchema.statics.getUserAttendance = async function(userId, limit = 30) {
  return this.find({ user: userId })
    .sort({ date: -1 })
    .limit(limit);
};

// Get attendance summary for a user
attendanceSchema.statics.getUserAttendanceSummary = async function(userId) {
  const records = await this.find({ user: userId });
  const totalDays = records.length;
  const presentDays = records.filter(r => r.checkOut).length;
  const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
  
  return {
    totalDays,
    presentDays,
    attendanceRate: attendanceRate.toFixed(1)
  };
};

// Get today's attendance
attendanceSchema.statics.getTodayAttendance = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    date: { $gte: today, $lt: tomorrow }
  }).populate('user', 'name email');
};

// Get attendance by date range
attendanceSchema.statics.getAttendanceByDateRange = async function(startDate, endDate, userId = null) {
  const query = {
    date: { $gte: new Date(startDate), $lte: new Date(endDate) }
  };
  if (userId) {
    query.user = userId;
  }
  return this.find(query).populate('user', 'name email');
};

// Check if user already checked in today
attendanceSchema.statics.hasCheckedInToday = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const record = await this.findOne({
    user: userId,
    date: { $gte: today, $lt: tomorrow }
  });
  
  return !!record;
};

// Get active check-in (checked in but not checked out)
attendanceSchema.statics.getActiveCheckIn = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.findOne({
    user: userId,
    date: { $gte: today, $lt: tomorrow },
    checkOut: null
  }).sort({ checkIn: -1 });
};

// ===== INSTANCE METHODS =====

// Mark check-out
attendanceSchema.methods.markCheckOut = async function() {
  this.checkOut = new Date();
  await this.save();
  return this;
};

// Check if attendance is completed
attendanceSchema.methods.isCompleted = function() {
  return this.checkOut !== null;
};

// Get duration (if checked out)
attendanceSchema.methods.getDuration = function() {
  if (!this.checkOut) return null;
  const duration = this.checkOut - this.checkIn;
  const hours = Math.floor(duration / (1000 * 60 * 60));
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, total: duration };
};

module.exports = mongoose.model('Attendance', attendanceSchema);