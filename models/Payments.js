const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'QR' },
    txnId: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
