const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String, // hashed
  role: { type: String, default: "admin" }
});

module.exports = mongoose.model("Admin", adminSchema);