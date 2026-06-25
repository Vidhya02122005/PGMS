const mongoose = require('mongoose');

// Define the schema
const faceRecognitionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  faceDescriptor: {
    type: [Number],
    required: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  verified: {
    type: Boolean,
    default: true
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  registeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

// Indexes for faster queries
faceRecognitionSchema.index({ userId: 1 });
faceRecognitionSchema.index({ verified: 1 });

// Pre-save middleware to update timestamps
faceRecognitionSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Helper function for Euclidean distance
function calculateEuclideanDistance(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    sum += Math.pow(descriptor1[i] - descriptor2[i], 2);
  }
  return Math.sqrt(sum);
}

// Static method to find user by face descriptor
faceRecognitionSchema.statics.findUserByDescriptor = async function(descriptor, threshold = 0.6) {
  const allFaces = await this.find({ verified: true }).populate('userId', 'name email');
  
  let matchedUser = null;
  let minDistance = threshold;
  
  for (const face of allFaces) {
    const distance = calculateEuclideanDistance(descriptor, face.faceDescriptor);
    if (distance < minDistance) {
      minDistance = distance;
      matchedUser = face;
    }
  }
  
  return matchedUser;
};

// Check if model already exists to prevent OverwriteModelError
const FaceRecognition = mongoose.models.FaceRecognition || mongoose.model('FaceRecognition', faceRecognitionSchema);

// Attach helper function to the model
FaceRecognition.calculateEuclideanDistance = calculateEuclideanDistance;

module.exports = FaceRecognition;