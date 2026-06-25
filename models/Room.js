const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomNumber: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    sharing: { 
        type: Number, 
        required: true,
        min: 1,
        max: 6
    },
    type: { 
        type: String, 
        enum: ['AC', 'Non-AC'], 
        required: true 
    },
    occupants: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);