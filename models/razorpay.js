const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: "YOUR_KEY_ID",        // from Razorpay Dashboard
  key_secret: "YOUR_KEY_SECRET" // from Razorpay Dashboard
});

module.exports = razorpay;
