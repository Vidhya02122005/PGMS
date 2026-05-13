const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomNumber: { type: Number, required: true, unique: true },
    sharing: { type: Number, required: true }, // 1-5
    type: { type: String, enum: ['AC', 'Non-AC'], required: true },
    occupants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
