require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto'); 
const nodemailer = require('nodemailer'); 
const bcrypt = require('bcrypt');
const { OAuth2Client } = require("google-auth-library");

const User = require('./models/User');
const Room = require('./models/Room');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const Complaint = require('./models/Complaint');
const Payment = require('./models/Payments');


const app = express();

// -------------------------
// Middleware
// -------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key_here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));

// -------------------------./
// MongoDB Connection
// -------------------------
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/pgms';
mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// -------------------------
// Auth Middleware
// -------------------------
function isUserLoggedIn(req, res, next) {
  if (req.session.user) next();
  else res.status(401).json({ success: false, message: 'Unauthorized' });
}
function isAdminLoggedIn(req, res, next) {
  if (req.session.admin) next();
  else res.status(401).json({ success: false, message: 'Unauthorized' });
}

// -------------------------
// Google OAuth Client
// -------------------------
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// =======================
// USER ROUTES
// =======================

// User Registration
app.post('/user/register', async (req, res) => {
  try {
    const { name, dob, phone, email, password, address, motherName, motherPhone, fatherName, fatherPhone, guardianName, guardianPhone } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, dob, phone, email, password: hashedPassword, address, motherName, motherPhone, fatherName, fatherPhone, guardianName, guardianPhone });
    await user.save();
    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error registering user' });
  }
});

// User Login
app.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if(!match) return res.status(401).json({ success:false, message:'Invalid email or password' });

    req.session.user = { id: user._id, name: user.name, email: user.email, role: user.role };
    req.session.save(err => {
      if (err) return res.status(500).json({ success: false, message: 'Session error' });
      res.json({ success: true, name: user.name, userId: user._id, role: user.role });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout
app.post('/user/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    res.json({ success: true, message: 'Logged out' });
  });
});

// Google Login
app.post("/user/google-login", async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, email, password: "" });
      await user.save();
    }
    req.session.user = { id: user._id, name: user.name, email: user.email };
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Google login failed" });
  }
});

// Forgot Password
app.post('/user/forgot-password', async (req,res)=>{
  const { email } = req.body;
  try{
    const user = await User.findOne({ email });
    if(!user) return res.json({ success:false, message:'Email not registered.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpire = Date.now() + 3600000; 
    await user.save();

    const transporter = nodemailer.createTransport({
      service:'gmail',
      auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASS }
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'PGMS Password Reset',
      html:`Click <a href="http://localhost:${PORT}/reset-password.html?token=${token}">here</a> to reset your password.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ success:true, message:'Password reset link sent to your email.' });
  } catch(err){
    console.error(err);
    res.json({ success:false, message:'Server error' });
  }
});

// Change Password
app.post('/user/change-password', async (req,res)=>{
  const { email, currentPassword, newPassword } = req.body;
  try{
    const user = await User.findOne({ email });
    if(!user) return res.json({ success:false, message:'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if(!match) return res.json({ success:false, message:'Current password incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success:true, message:'Password changed successfully!' });
  } catch(err){
    console.error(err);
    res.json({ success:false, message:'Server error' });
  }
});

// Get current user info
app.get('/users/me', isUserLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id)
      .populate({ path: 'room', populate: { path: 'occupants', select: 'name email' } })
      .lean();
    res.json({ success: true, ...user });
  } catch(err) {
    res.status(500).json({ success:false, message:err.message });
  }
});

// =======================
// Complaints Routes
// =======================
// Submit complaint
app.post('/user/complaint', isUserLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { complaint } = req.body;

    if(!complaint) return res.status(400).json({ success:false, message:'Complaint cannot be empty' });

    const newComplaint = new Complaint({
      userId,
      complaint,
      status: 'Pending'
    });

    await newComplaint.save();
    res.json({ success:true, message:'Complaint registered successfully' });
  } catch(err) {
    console.error(err);
    res.status(500).json({ success:false, message:'Error registering complaint' });
  }
});

app.get('/user/complaints', isUserLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const complaints = await Complaint.find({ userId }).sort({ createdAt: -1 });
    res.json({ success:true, complaints });
  } catch(err) {
    console.error(err);
    res.status(500).json({ success:false, message:err.message });
  }
});
app.get('/admin/complaints/data', isAdminLoggedIn, async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate('userId', 'name email') // fetch user name & email
      .sort({ createdAt: -1 });

    res.json({ success:true, complaints });
  } catch(err) {
    console.error(err);
    res.status(500).json({ success:false, message:err.message });
  }
});
app.put('/admin/complaints/:id', isAdminLoggedIn, async (req, res) => {
  try {
    const { status } = req.body;
    if(!['Pending','InProgress','Resolved'].includes(status)) 
      return res.status(400).json({ success:false, message:'Invalid status' });

    await Complaint.findByIdAndUpdate(req.params.id, { status });
    res.json({ success:true, message:'Status updated successfully' });
  } catch(err) {
    console.error(err);
    res.status(500).json({ success:false, message:err.message });
  }
});
// Get complete user details for admin
app.get('/admin/user/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Fetch user basic info
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Fetch attendance
    const attendance = await Attendance.find({ user: userId }).lean();
    const formattedAttendance = attendance.map(a => ({
      date: a.checkIn,
      status: a.checkOut ? 'Present' : 'Checked-in',
      mealTaken: a.mealTaken || '-'
    }));

    // Fetch payments
     const payments = await Payment.find({ userId });

    // Fetch complaints **for this user only**
    const complaints = await Complaint.find({ userId }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      user,
      attendance: formattedAttendance,
      payments,
      complaints
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin views all complaints (with optional filter by user)
app.get('/admin/complaints/data', isAdminLoggedIn, async (req, res) => {
  try {
    const { userId } = req.query;

    // Build query dynamically
    let query = {};
    if (userId) {
      query.userId = userId; // filter by specific user
    }

    const complaints = await Complaint.find(query)
      .populate('userId', 'name email') // fetch user details
      .sort({ createdAt: -1 });

    res.json({ success: true, complaints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =======================
// ADMIN ROUTES
// =======================

// Admin login
app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  if (email === adminEmail && password === adminPassword) {
    req.session.admin = true;
    return res.json({ success: true, message: 'Admin login successful' });
  }
  res.status(401).json({ success: false, message: 'Invalid email or password' });
});

// Admin logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    res.json({ success: true, message: 'Logged out' });
  });
});

// Fetch all registered users
app.get('/admin/registrations', isAdminLoggedIn, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch(err){
    console.error(err);
    res.status(500).json({ success:false, message:'Error fetching users' });
  }
});

// Get complete user details for admin
app.get('/admin/user/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const attendance = await Attendance.find({ user: userId }).lean();
    const formattedAttendance = attendance.map(a => ({
      date: a.checkIn,
      status: a.checkOut ? 'Present' : 'Checked-in',
      mealTaken: a.mealTaken || '-'
    }));

    const payments = await Payment.find({ user: userId }).lean();
    const complaints = await Complaint.find({ user: userId }).lean();

    res.json({
      success: true,
      user,
      attendance: formattedAttendance,
      payments,
      complaints
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// =======================
// ROOM MANAGEMENT
// =======================

// Get all rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find().populate('occupants', 'name email');
    res.json({ success:true, rooms });
  } catch(err) {
    res.status(500).json({ success:false, message:err.message });
  }
});

// Add room
app.post('/rooms/add', isAdminLoggedIn, async (req,res)=>{
  try{
    const { roomNumber, sharing, type } = req.body;
    const room = new Room({ roomNumber, sharing, type });
    await room.save();
    res.json({ success:true, message:'Room added successfully', room });
  }catch(err){
    res.status(400).json({ success:false, message:err.message });
  }
});

// Allocate room
app.post('/rooms/allocate', isAdminLoggedIn, async (req,res)=>{
  try{
    const { userId, roomNumber } = req.body;
    const room = await Room.findOne({ roomNumber }).populate('occupants');
    if(!room) return res.status(404).json({ success:false, message:'Room not found' });
    if(room.occupants.length >= room.sharing) return res.status(400).json({ success:false, message:'Room is full' });

    const user = await User.findById(userId);
    if(!user) return res.status(404).json({ success:false, message:'User not found' });

    user.room = room._id;
    room.occupants.push(user._id);

    await user.save();
    await room.save();

    res.json({ success:true, message:'Room allocated successfully', room, user });
  } catch(err){
    res.status(500).json({ success:false, message:err.message });
  }
});

// Remove user from room
app.put('/rooms/removeUser/:roomId/:userId', isAdminLoggedIn, async(req,res)=>{
  try{
    const { roomId, userId } = req.params;
    const room = await Room.findById(roomId);
    const user = await User.findById(userId);
    if(!room || !user) return res.status(404).json({ success:false, message:'Room or user not found' });

    room.occupants = room.occupants.filter(id=>id.toString()!==userId);
    user.room = null;

    await room.save();
    await user.save();

    res.json({ success:true, message:'User removed from room successfully', room, user });
  }catch(err){
    res.status(500).json({ success:false, message:err.message });
  }
});
app.get('/users', isAdminLoggedIn, async (req, res) => {
  try {
    const users = await User.find().select('name');
    res.json(users);
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// =======================
// ATTENDANCE
// =======================
// ------------------- ATTENDANCE ROUTES -------------------

// Check In
app.post('/attendance/checkin', async (req, res) => {
    try {
        const { userId } = req.body;
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const time = new Date().toLocaleTimeString();

        let record = await Attendance.findOne({ user: userId, date });
        if (record) return res.status(400).json({ message: 'Already checked in today!' });

        record = new Attendance({ user: userId, date, checkIn: time });
        await record.save();
        res.json({ message: 'Check-in successful', record });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check Out
app.post('/attendance/checkout', async (req, res) => {
    try {
        const { userId } = req.body;
        const date = new Date().toISOString().split('T')[0];
        const time = new Date().toLocaleTimeString();

        let record = await Attendance.findOne({ user: userId, date });
        if (!record) return res.status(400).json({ message: 'You have not checked in today!' });
        if (record.checkOut) return res.status(400).json({ message: 'Already checked out today!' });

        record.checkOut = time;
        await record.save();
        res.json({ message: 'Check-out successful', record });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance for a user
app.get('/attendance/user/:userId', async (req, res) => {
    try {
        const records = await Attendance.find({ user: req.params.userId })
                                        .populate('user', 'name email')
                                        .sort({ date: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all attendance (admin)
app.get('/attendance/all', async (req, res) => {
    try {
        const records = await Attendance.find()
                                        .populate('user', 'name email')
                                        .sort({ date: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// =======================
// PAYMENTS
// =======================

// ---------------- USER ROUTES ----------------

// Add a payment
app.post('/user/payments', async (req, res) => {
    try {
        const { userId, amount, txnId } = req.body;
        const payment = new Payment({ userId, amount, txnId });
        await payment.save();
        res.json({ success: true, message: 'Payment submitted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get payments for a user
app.get('/user/payments/:userId', async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json({ success: true, payments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------- ADMIN ROUTES ----------------

// Get all payments
app.get('/admin/payments', async (req, res) => {
    try {
        const payments = await Payment.find().populate('userId', 'name email').sort({ date: -1 });
        res.json({ success: true, payments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update payment status
app.put('/admin/payments/:id', async (req, res) => {
    try {
        const { status } = req.body;
        await Payment.findByIdAndUpdate(req.params.id, { status });
        res.json({ success: true, message: 'Payment status updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

//==============
//NOTIFICATION
//==============
// =======================
// NOTIFICATIONS MODULE
// =======================

// Admin: Send general notification
app.post('/admin/notifications', isAdminLoggedIn, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Title and Message are required' });

    const notif = new Notification({
      userId: null, // always general
      title,
      message,
      type: type || 'General', // default type
      isGeneral: true,
      createdAt: new Date()
    });

    await notif.save();
    return res.json({ success: true, message: 'Notification sent successfully', notif });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Get all notifications
app.get('/admin/notifications/all', isAdminLoggedIn, async (req, res) => {
  try {
    const notifications = await Notification.find({ isGeneral: true }).sort({ createdAt: -1 });
    return res.json({ success: true, notifications });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// User: Get general notifications
app.get('/user/notifications', isUserLoggedIn, async (req, res) => {
  try {
    const notifications = await Notification.find({ isGeneral: true }).sort({ createdAt: -1 });
    return res.json({ success: true, notifications });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------- ATTENDANCE MODULE ----------------

// Get all users (for admin dropdown)
app.get('/api/users', isAdminLoggedIn, async (req, res) => {
    try {
        const users = await User.find().select('name _id').sort({ name: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching users', error: err });
    }
});

// Check-in (creates a new attendance record)
app.post('/api/attendance/checkin', isAdminLoggedIn, async (req, res) => {
    try {
        const { userId } = req.body;

        const newAttendance = new Attendance({
            user: userId,
            date: new Date(),
            checkIn: new Date()
        });

        await newAttendance.save();
        res.json({ message: 'Check-in successful', attendance: newAttendance });
    } catch (err) {
        res.status(500).json({ message: 'Error during check-in', error: err });
    }
});

// Check-out (updates the latest record without checkOut)
app.post('/api/attendance/checkout', isAdminLoggedIn, async (req, res) => {
    try {
        const { userId } = req.body;

        // Find latest attendance record for this user with checkOut = null
        const attendance = await Attendance.findOne({ user: userId, checkOut: null }).sort({ createdAt: -1 });
        if (!attendance) {
            return res.status(400).json({ message: 'No active check-in found. Please check in first.' });
        }

        attendance.checkOut = new Date();
        await attendance.save();

        res.json({ message: 'Check-out successful', attendance });
    } catch (err) {
        res.status(500).json({ message: 'Error during check-out', error: err });
    }
});

// Get all attendance records (admin view)
app.get('/api/attendance/admin/all', isAdminLoggedIn, async (req, res) => {
    try {
        const records = await Attendance.find()
            .populate('user', 'name email')
            .sort({ createdAt: -1 }); // latest first
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching attendance', error: err });
    }
});


//------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
