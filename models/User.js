const mongoose = require('mongoose'); 

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    dob: { type: Date }, 
    phone: { type: String },
    email: { type: String, unique: true, required: true },
    password: { type: String }, // optional for Google Sign-In
    address: { type: String },

    motherName: { type: String },
    motherPhone: { type: String },
    fatherName: { type: String },
    fatherPhone: { type: String },
    guardianName: { type: String },
    guardianPhone: { type: String },

    role: { type: String, default: 'student' },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },

    faceData: { type: [Number], default: [] }, 
    googleId: { type: String }, // Google UID
    photo: { type: String } // Google profile picture
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
