const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Replied'],
    default: 'Pending'
  },
  reply: {
    type: String,
    default: ''
  },
  repliedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Enquiry', enquirySchema);