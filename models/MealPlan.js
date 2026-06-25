const mongoose = require('mongoose');

const mealPlanSchema = new mongoose.Schema({
  day: { 
    type: String, 
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true,
    unique: true
  },
  breakfast: { type: String, required: true },
  lunch: { type: String, required: true },
  snacks: { type: String, required: true },
  dinner: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MealPlan', mealPlanSchema);