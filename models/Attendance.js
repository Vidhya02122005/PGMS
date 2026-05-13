// models/Attendance.js
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
        required: true,
        default: Date.now
    },   // Time when user checked in
    checkOut: { 
        type: Date 
    },  // Time when user checked out
    status: { 
        type: String, 
        enum: ['Present', 'Absent', 'Leave'], 
        default: 'Present' 
    }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
