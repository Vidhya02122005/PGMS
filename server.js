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
const MealPlan = require('./models/MealPlan');
const FaceRecognition = require('./models/FaceRecognition');
const Analytics = require('./models/Analytics');

const app = express();

// -------------------------
// Middleware - UPDATED
// -------------------------
app.use(express.json({ limit: '10mb' })); // Increased limit for images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Root route
app.get("/", (req, res) => {
  res.send("PGMS Backend is running 🚀");
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key_here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));


// -------------------------
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
// PASSWORD RESET WITH VERIFICATION CODE
// =======================

// Store reset codes temporarily (in production, use Redis or a database collection)
const resetCodes = new Map();

// Forgot Password - Send verification code
app.post('/user/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required' 
    });
  }
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email not registered. Please sign up first.' 
      });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store the code with expiry (10 minutes)
    resetCodes.set(email, {
      code: verificationCode,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    console.log(`📧 Verification code for ${email}: ${verificationCode}`);

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: process.env.EMAIL, 
        pass: process.env.EMAIL_PASS 
      }
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: '🔐 PGMS Password Reset Verification Code',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">🔐 PGMS</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0;">Paying Guest Management System</p>
          </div>
          
          <h3 style="color: #1e3a8a; margin-top: 0;">Password Reset Request</h3>
          <p style="color: #333; line-height: 1.6;">You requested to reset your password for your PGMS account. Use the verification code below to reset your password:</p>
          
          <div style="text-align: center; padding: 20px; background: #ffffff; border-radius: 8px; border: 2px dashed #2563eb; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a;">${verificationCode}</span>
          </div>
          
          <p style="color: #555; font-size: 14px;"><strong>Important:</strong> This code will expire in <strong>10 minutes</strong>.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          
          <p style="color: #888; font-size: 12px; text-align: center;">If you didn't request this, please ignore this email. Your account is safe.</p>
          <p style="color: #888; font-size: 12px; text-align: center;">&copy; 2024 PGMS - All rights reserved.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Verification code sent to your email!'
    });
    
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error sending verification code' 
    });
  }
});

// Reset Password - Verify code and update password
app.post('/user/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  
  if (!email || !code || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email, verification code, and new password are required' 
    });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false, 
      message: 'Password must be at least 6 characters long' 
    });
  }
  
  try {
    // Check if code exists and is valid
    const storedData = resetCodes.get(email);
    
    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        message: 'No reset request found. Please request a new code.' 
      });
    }
    
    // Check if code expired
    if (Date.now() > storedData.expiresAt) {
      resetCodes.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }
    
    // Check if code matches
    if (storedData.code !== code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid verification code. Please try again.' 
      });
    }
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
    await user.save();
    
    // Remove the used code
    resetCodes.delete(email);
    
    // Send confirmation email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: process.env.EMAIL, 
        pass: process.env.EMAIL_PASS 
      }
    });
    
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: '✅ Password Reset Successful - PGMS',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">✅ Password Reset</h2>
          </div>
          
          <h3 style="color: #1e3a8a; margin-top: 0;">Password Reset Successful!</h3>
          <p style="color: #333; line-height: 1.6;">Your PGMS account password has been successfully reset.</p>
          
          <div style="text-align: center; padding: 15px; background: #d1fae5; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 16px; color: #065f46;">🔒 Your password has been updated securely</span>
          </div>
          
          <p style="color: #555; font-size: 14px;">You can now login with your new password.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          
          <p style="color: #888; font-size: 12px; text-align: center;">&copy; 2024 PGMS - All rights reserved.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully!' 
    });
    
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error resetting password' 
    });
  }
});

// Resend verification code
app.post('/user/resend-code', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required' 
    });
  }
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email not registered' 
      });
    }
    
    // Generate new 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Update the stored code
    resetCodes.set(email, {
      code: verificationCode,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
    
    console.log(`📧 New verification code for ${email}: ${verificationCode}`);
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: process.env.EMAIL, 
        pass: process.env.EMAIL_PASS 
      }
    });
    
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: '🔄 New Verification Code - PGMS Password Reset',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">🔄 New Verification Code</h2>
          </div>
          
          <p style="color: #333; line-height: 1.6;">You requested a new verification code. Use the code below to reset your password:</p>
          
          <div style="text-align: center; padding: 20px; background: #ffffff; border-radius: 8px; border: 2px dashed #2563eb; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a;">${verificationCode}</span>
          </div>
          
          <p style="color: #555; font-size: 14px;"><strong>Important:</strong> This code will expire in <strong>10 minutes</strong>.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #888; font-size: 12px; text-align: center;">&copy; 2024 PGMS - All rights reserved.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'New verification code sent to your email!'
    });
    
  } catch (error) {
    console.error('❌ Resend code error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error resending code' 
    });
  }
});

// =======================
// DELETE USER - ADMIN ONLY
// =======================
app.delete('/admin/users/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    console.log('🗑️ Attempting to delete user:', userId);
    
    // Find the user first
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    console.log('User found:', user.name, user.email);
    
    // Check if user has any active bookings/allocations
    // If user has a room allocated, remove them from room first
    if (user.room) {
      const room = await Room.findById(user.room);
      if (room) {
        room.occupants = room.occupants.filter(id => id.toString() !== userId);
        await room.save();
        console.log('✅ Removed user from room:', room.roomNumber);
      }
    }
    
    // Delete user's attendance records
    await Attendance.deleteMany({ user: userId });
    console.log('✅ Deleted attendance records');
    
    // Delete user's complaints
    await Complaint.deleteMany({ userId: userId });
    console.log('✅ Deleted complaints');
    
    // Delete user's payments
    await Payment.deleteMany({ userId: userId });
    console.log('✅ Deleted payments');
    
    // Delete user's face recognition data
    await FaceRecognition.deleteOne({ userId: userId });
    console.log('✅ Deleted face recognition data');
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    console.log('✅ User deleted successfully');
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully along with all associated data' 
    });
    
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error deleting user' 
    });
  }
});

//======================

//======================
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
// PROFILE ROUTES - ADDED
// =======================

// Update profile image
app.post('/user/update-profile-image', isUserLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { profileImage } = req.body;

    console.log('📸 ===== PROFILE IMAGE UPLOAD =====');
    console.log('📸 User ID:', userId);
    console.log('📸 Image received:', profileImage ? 'YES' : 'NO');
    console.log('📸 Image length:', profileImage ? profileImage.length : 0);

    if (!profileImage) {
      console.log('❌ No image provided');
      return res.status(400).json({ 
        success: false, 
        message: 'No image provided' 
      });
    }

    // Validate base64 format
    if (!profileImage.startsWith('data:image/')) {
      console.log('❌ Invalid image format');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid image format. Please upload a valid image.' 
      });
    }

    // Check image size (max 5MB)
    const base64Size = Buffer.byteLength(profileImage, 'utf8');
    console.log('📸 Image size:', Math.round(base64Size / 1024), 'KB');
    
    if (base64Size > 5 * 1024 * 1024) {
      console.log('❌ Image too large');
      return res.status(400).json({ 
        success: false, 
        message: 'Image size exceeds 5MB limit' 
      });
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage: profileImage },
      { new: true }
    );

    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    console.log('✅ Profile image updated for:', user.name);
    console.log('📸 ===== UPLOAD SUCCESS =====');

    res.json({ 
      success: true, 
      message: 'Profile image updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role
      }
    });
  } catch (err) {
    console.error('❌ Profile image error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error updating profile image' 
    });
  }
});

// Update profile
app.put('/user/update-profile', isUserLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, phone, address, dob, motherName, fatherName, guardianName } = req.body;

    console.log('📝 ===== PROFILE UPDATE =====');
    console.log('📝 User ID:', userId);
    console.log('📝 Data:', { name, phone, address, dob, motherName, fatherName, guardianName });

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (dob !== undefined) updateData.dob = dob;
    if (motherName !== undefined) updateData.motherName = motherName;
    if (fatherName !== undefined) updateData.fatherName = fatherName;
    if (guardianName !== undefined) updateData.guardianName = guardianName;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    console.log('✅ Profile updated for:', user.name);
    console.log('📝 ===== UPDATE SUCCESS =====');

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: user
    });
  } catch (err) {
    console.error('❌ Profile update error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error updating profile' 
    });
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
      .populate('userId', 'name email')
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
      query.userId = userId;
    }

    const complaints = await Complaint.find(query)
      .populate('userId', 'name email')
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
// ROOM MANAGEMENT - FIXED
// =======================

// Get all rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find().populate('occupants', 'name email');
    res.json({ success: true, rooms });
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get room by room number (for quick lookup)
app.get('/rooms/lookup/:roomNumber', isAdminLoggedIn, async (req, res) => {
  try {
    const roomNumber = req.params.roomNumber;
    
    // Try exact match first
    let room = await Room.findOne({ 
      roomNumber: roomNumber.toString().trim() 
    }).populate('occupants', 'name email');
    
    // If not found, try case insensitive
    if (!room) {
      room = await Room.findOne({ 
        roomNumber: { $regex: new RegExp(`^${roomNumber.trim()}$`, 'i') } 
      }).populate('occupants', 'name email');
    }
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }
    
    res.json({ success: true, room });
  } catch (err) {
    console.error('Room lookup error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error looking up room' 
    });
  }
});

// Add room with duplicate check
app.post('/rooms/add', isAdminLoggedIn, async (req, res) => {
  try {
    const { roomNumber, sharing, type } = req.body;
    
    // Validate input
    if (!roomNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room number is required' 
      });
    }
    
    // Check for existing room (case insensitive)
    const existingRoom = await Room.findOne({ 
      roomNumber: { $regex: new RegExp(`^${roomNumber}$`, 'i') } 
    });
    
    if (existingRoom) {
      return res.status(400).json({ 
        success: false, 
        message: `Room number "${roomNumber}" already exists!` 
      });
    }
    
    const room = new Room({ 
      roomNumber: roomNumber.toString().trim(), 
      sharing: parseInt(sharing), 
      type 
    });
    
    await room.save();
    res.json({ 
      success: true, 
      message: 'Room added successfully', 
      room 
    });
  } catch (err) {
    console.error('Add room error:', err);
    // Handle duplicate key error from MongoDB
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: `Room number "${req.body.roomNumber}" already exists!` 
      });
    }
    res.status(400).json({ 
      success: false, 
      message: err.message || 'Error adding room' 
    });
  }
});

// Allocate room to user - FIXED for numeric room numbers
app.post('/rooms/allocate', isAdminLoggedIn, async (req, res) => {
  try {
    const { userId, roomNumber } = req.body;
    
    console.log('📝 Allocate request:', { userId, roomNumber });
    console.log('📝 Room number type:', typeof roomNumber, 'Value:', roomNumber);
    
    if (!userId || !roomNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and Room Number are required' 
      });
    }
    
    // Try multiple approaches to find the room
    let room = null;
    
    // 1. Try exact match as string
    room = await Room.findOne({ 
      roomNumber: roomNumber.toString().trim() 
    }).populate('occupants');
    
    // 2. If not found, try case insensitive (for string rooms)
    if (!room) {
      room = await Room.findOne({ 
        roomNumber: { $regex: new RegExp(`^${roomNumber.trim()}$`, 'i') } 
      }).populate('occupants');
    }
    
    // 3. If not found, try as Number (for numeric rooms)
    if (!room && !isNaN(roomNumber)) {
      room = await Room.findOne({ 
        roomNumber: parseInt(roomNumber) 
      }).populate('occupants');
    }
    
    // 4. If still not found, get all rooms and compare
    if (!room) {
      const allRooms = await Room.find();
      room = allRooms.find(r => {
        // Compare as strings
        if (r.roomNumber.toString() === roomNumber.toString().trim()) return true;
        // Compare as numbers if both are numbers
        if (!isNaN(r.roomNumber) && !isNaN(roomNumber) && 
            parseInt(r.roomNumber) === parseInt(roomNumber)) return true;
        return false;
      });
      if (room) {
        await room.populate('occupants');
      }
    }
    
    if (!room) {
      console.log('❌ Room not found:', roomNumber);
      const availableRooms = await Room.find().select('roomNumber');
      return res.status(404).json({ 
        success: false, 
        message: `Room "${roomNumber}" not found. Available rooms: ${availableRooms.map(r => r.roomNumber).join(', ')}` 
      });
    }
    
    console.log('✅ Room found:', room.roomNumber, 'Occupants:', room.occupants.length);
    
    // Check if room is full
    if (room.occupants.length >= room.sharing) {
      return res.status(400).json({ 
        success: false, 
        message: `Room is full (${room.occupants.length}/${room.sharing})` 
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    console.log('✅ User found:', user.name);
    
    // Check if user already has a room
    if (user.room) {
      const existingRoom = await Room.findById(user.room);
      return res.status(400).json({ 
        success: false, 
        message: `User already has a room allocated: ${existingRoom?.roomNumber || 'Unknown'}` 
      });
    }

    // Allocate room
    user.room = room._id;
    room.occupants.push(user._id);

    await user.save();
    await room.save();

    // Get updated room with occupants
    const updatedRoom = await Room.findById(room._id).populate('occupants', 'name email');

    res.json({ 
      success: true, 
      message: `Room ${room.roomNumber} allocated to ${user.name} successfully`, 
      room: updatedRoom, 
      user 
    });
  } catch (err) {
    console.error('❌ Allocate room error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error allocating room' 
    });
  }
});

// Remove user from room
app.put('/rooms/removeUser/:roomId/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    
    const room = await Room.findById(roomId);
    const user = await User.findById(userId);
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if user is in the room
    if (!room.occupants.some(id => id.toString() === userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not in this room' 
      });
    }

    // Remove user from room
    room.occupants = room.occupants.filter(id => id.toString() !== userId);
    user.room = null;

    await room.save();
    await user.save();

    const updatedRoom = await Room.findById(roomId).populate('occupants', 'name email');

    res.json({ 
      success: true, 
      message: 'User removed from room successfully', 
      room: updatedRoom, 
      user 
    });
  } catch (err) {
    console.error('Remove user error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error removing user from room' 
    });
  }
});

// Delete room
app.delete('/rooms/delete/:roomId', isAdminLoggedIn, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    
    // Find the room first
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }
    
    // Check if room has occupants
    if (room.occupants && room.occupants.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete room with ${room.occupants.length} occupant(s). Please remove all occupants first.` 
      });
    }
    
    // Delete the room
    await Room.findByIdAndDelete(roomId);
    
    res.json({ 
      success: true, 
      message: 'Room deleted successfully' 
    });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error deleting room' 
    });
  }
});

// Get users without room (for allocation dropdown)
app.get('/users/without-room', isAdminLoggedIn, async (req, res) => {
  try {
    const users = await User.find({ 
      room: { $eq: null } 
    }).select('name email phone');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users without room:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching users' 
    });
  }
});

// Get users with room (for reporting)
app.get('/users/with-room', isAdminLoggedIn, async (req, res) => {
  try {
    const users = await User.find({ 
      room: { $ne: null } 
    })
    .select('name email phone room')
    .populate('room', 'roomNumber type');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users with room:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching users' 
    });
  }
});

// Get room stats (for dashboard)
app.get('/rooms/stats', async (req, res) => {
  try {
    const rooms = await Room.find();
    const total = rooms.length;
    let occupied = 0;
    let totalCapacity = 0;
    let totalOccupants = 0;

    rooms.forEach(room => {
      const occupantCount = room.occupants?.length || 0;
      if (occupantCount > 0) occupied++;
      totalCapacity += room.sharing;
      totalOccupants += occupantCount;
    });

    const vacant = total - occupied;
    const occupancyRate = totalCapacity > 0 ? ((totalOccupants / totalCapacity) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      stats: {
        total,
        occupied,
        vacant,
        occupancyRate,
        totalCapacity,
        totalOccupants
      }
    });
  } catch (err) {
    console.error('Room stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching room stats' 
    });
  }
});

// ========== END OF ROOM MANAGEMENT ==========

// Get users for dropdown
app.get('/users', isAdminLoggedIn, async (req, res) => {
  try {
    const users = await User.find().select('name email _id room');
    res.json(users);
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// =======================
// ATTENDANCE - MULTIPLE CHECK-IN/OUT SUPPORT
// =======================

// Check In - Allows multiple check-ins per day (when user leaves and returns)
app.post('/api/attendance/checkin', isAdminLoggedIn, async (req, res) => {
    try {
        const { userId } = req.body;
        console.log('📝 Check-in request for user:', userId);
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID required' 
            });
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check if there's an ACTIVE check-in (not checked out)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const activeRecord = await Attendance.findOne({
            user: userId,
            date: { $gte: today, $lt: tomorrow },
            checkOut: null
        });

        // If there's an active check-in, prevent new check-in
        if (activeRecord) {
            return res.status(400).json({ 
                success: false, 
                message: 'Already checked in! Please check out first.',
                record: activeRecord
            });
        }

        // Create new attendance record
        const newAttendance = new Attendance({
            user: userId,
            date: new Date(),
            checkIn: new Date(),
            checkOut: null,
            faceVerified: true,
            status: 'Present'
        });

        await newAttendance.save();
        await newAttendance.populate('user', 'name email');

        console.log('✅ Check-in successful for:', user.name);
        
        return res.status(200).json({ 
            success: true,
            message: 'Check-in successful', 
            attendance: newAttendance 
        });
    } catch (err) {
        console.error('❌ Check-in error:', err);
        return res.status(500).json({ 
            success: false, 
            message: err.message || 'Server error during check-in'
        });
    }
});

// Check Out - Updates the active check-in record
app.post('/api/attendance/checkout', isAdminLoggedIn, async (req, res) => {
    try {
        const { userId } = req.body;
        console.log('📝 Check-out request for user:', userId);
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID required' 
            });
        }

        // Find active check-in (today, no check-out)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const activeRecord = await Attendance.findOne({
            user: userId,
            date: { $gte: today, $lt: tomorrow },
            checkOut: null
        }).sort({ checkIn: -1 });

        if (!activeRecord) {
            return res.status(400).json({ 
                success: false, 
                message: 'No active check-in found. Please check in first.' 
            });
        }

        // Update check-out time
        activeRecord.checkOut = new Date();
        await activeRecord.save();
        await activeRecord.populate('user', 'name email');

        console.log('✅ Check-out successful for:', activeRecord.user.name);
        
        return res.status(200).json({ 
            success: true,
            message: 'Check-out successful', 
            attendance: activeRecord 
        });
    } catch (err) {
        console.error('❌ Check-out error:', err);
        return res.status(500).json({ 
            success: false, 
            message: err.message || 'Server error during check-out'
        });
    }
});

// Get all attendance records (admin view)
app.get('/api/attendance/admin/all', isAdminLoggedIn, async (req, res) => {
    try {
        console.log('📊 Fetching all attendance records');
        
        const records = await Attendance.find()
            .populate('user', 'name email')
            .sort({ date: -1, checkIn: -1 });

        // Format the response
        const formattedRecords = records.map(record => ({
            _id: record._id,
            user: record.user || { name: 'Deleted User', email: '' },
            date: record.date,
            checkIn: record.checkIn,
            checkOut: record.checkOut || null,
            status: record.checkOut ? 'Completed' : 'Pending',
            faceVerified: record.faceVerified || false,
            createdAt: record.createdAt
        }));

        console.log(`✅ Found ${formattedRecords.length} attendance records`);
        
        return res.status(200).json(formattedRecords);
    } catch (err) {
        console.error('❌ Error fetching attendance:', err);
        return res.status(500).json({ 
            success: false, 
            message: err.message || 'Error fetching attendance records'
        });
    }
});

// Get attendance for a specific user
app.get('/attendance/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        console.log('📊 Fetching attendance for user:', userId);
        
        const records = await Attendance.find({ user: userId })
            .populate('user', 'name email')
            .sort({ date: -1, checkIn: -1 });
            
        console.log(`✅ Found ${records.length} records for user`);
        
        return res.status(200).json(records);
    } catch (error) {
        console.error('❌ Error fetching user attendance:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Error fetching user attendance'
        });
    }
});

// Get attendance stats for dashboard
app.get('/api/attendance/stats', isAdminLoggedIn, async (req, res) => {
    try {
        console.log('📊 Fetching attendance stats');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const totalUsers = await User.countDocuments();
        
        // Get distinct users who checked in today
        const todayRecords = await Attendance.find({
            date: { $gte: today, $lt: tomorrow }
        }).distinct('user');
        
        const presentToday = todayRecords.length;
        const absentToday = totalUsers - presentToday;
        const attendanceRate = totalUsers > 0 ? (presentToday / totalUsers) * 100 : 0;

        console.log(`✅ Stats: Total: ${totalUsers}, Present: ${presentToday}, Rate: ${attendanceRate}%`);
        
        return res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                presentToday,
                absentToday: absentToday > 0 ? absentToday : 0,
                attendanceRate: attendanceRate.toFixed(1)
            }
        });
    } catch (error) {
        console.error('❌ Error fetching attendance stats:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Error fetching attendance stats'
        });
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
      userId: null,
      title,
      message,
      type: type || 'General',
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
// =======================
// ENQUIRY MANAGEMENT
// =======================

const Enquiry = require('./models/Enquiry');

// Submit enquiry (from contact form)
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name, email, and message are required.' 
    });
  }
  
  try {
    // Save enquiry to database
    const enquiry = new Enquiry({
      name,
      email,
      phone: phone || '',
      message,
      status: 'Pending',
      createdAt: new Date()
    });
    await enquiry.save();
    
    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: process.env.EMAIL, 
        pass: process.env.EMAIL_PASS 
      }
    });
    
    // Email to admin
    const adminMailOptions = {
      from: process.env.EMAIL,
      to: process.env.EMAIL,
      subject: `📩 New Enquiry from ${name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">📩 New Enquiry</h2>
          </div>
          
          <h3 style="color: #1e3a8a; margin-top: 0;">Message Details</h3>
          
          <div style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
            <strong>Name:</strong> ${name}
          </div>
          <div style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
            <strong>Email:</strong> ${email}
          </div>
          ${phone ? `<div style="padding: 10px 0; border-bottom: 1px solid #e0e0e0;">
            <strong>Phone:</strong> ${phone}
          </div>` : ''}
          <div style="padding: 10px 0;">
            <strong>Message:</strong>
            <p style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e0e0e0;">${message}</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #888; font-size: 12px; text-align: center;">Reply to this enquiry from the admin panel.</p>
        </div>
      `
    };
    
    await transporter.sendMail(adminMailOptions);
    
    // Auto-reply to user
    const autoReplyOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: '✅ We received your message - Safestay PG',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">✅ Thank You!</h2>
          </div>
          
          <h3 style="color: #1e3a8a; margin-top: 0;">Hello ${name},</h3>
          <p style="color: #333; line-height: 1.6;">We have received your message and will get back to you within <strong>24 hours</strong>.</p>
          
          <div style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e0e0e0; margin: 10px 0;">
            <p style="margin: 0; color: #555;"><strong>Your message:</strong></p>
            <p style="margin: 4px 0 0 0; color: #333;">"${message}"</p>
          </div>
          
          <p style="color: #555; font-size: 14px;">For urgent inquiries, please call us at <strong>+91 98765 43210</strong>.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #888; font-size: 12px; text-align: center;">&copy; 2024 Safestay PG - All rights reserved.</p>
        </div>
      `
    };
    
    await transporter.sendMail(autoReplyOptions);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully!' 
    });
    
  } catch (error) {
    console.error('❌ Contact form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending message. Please try again.' 
    });
  }
});

// Get all enquiries (Admin)
app.get('/admin/enquiries', isAdminLoggedIn, async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    res.json({ success: true, enquiries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reply to enquiry (Admin)
app.post('/admin/enquiries/reply', isAdminLoggedIn, async (req, res) => {
  const { enquiryId, reply } = req.body;
  
  if (!enquiryId || !reply) {
    return res.status(400).json({ 
      success: false, 
      message: 'Enquiry ID and reply are required.' 
    });
  }
  
  try {
    const enquiry = await Enquiry.findById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ 
        success: false, 
        message: 'Enquiry not found.' 
      });
    }
    
    // Update enquiry status
    enquiry.status = 'Replied';
    enquiry.reply = reply;
    enquiry.repliedAt = new Date();
    await enquiry.save();
    
    // Send reply email to user
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: process.env.EMAIL, 
        pass: process.env.EMAIL_PASS 
      }
    });
    
    const mailOptions = {
      from: process.env.EMAIL,
      to: enquiry.email,
      subject: `📩 Reply to your enquiry - Safestay PG`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background: #f9f9f9;">
          <div style="text-align: center; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: #ffffff; margin: 0;">📩 Reply to Your Enquiry</h2>
          </div>
          
          <h3 style="color: #1e3a8a; margin-top: 0;">Hello ${enquiry.name},</h3>
          <p style="color: #333; line-height: 1.6;">Thank you for your enquiry. Here is our response:</p>
          
          <div style="background: #ffffff; padding: 16px; border-radius: 8px; border: 2px solid #2563eb; margin: 16px 0;">
            <p style="margin: 0; color: #1e3a8a; font-weight: 600;">Reply from Admin:</p>
            <p style="margin: 8px 0 0 0; color: #333; line-height: 1.6;">${reply}</p>
          </div>
          
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin: 12px 0;">
            <p style="margin: 0; color: #64748b; font-size: 13px;">
              <strong>Your original message:</strong> "${enquiry.message}"
            </p>
          </div>
          
          <p style="color: #555; font-size: 14px;">For further inquiries, please reply to this email or call us at <strong>+91 98765 43210</strong>.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #888; font-size: 12px; text-align: center;">&copy; 2024 Safestay PG - All rights reserved.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    // Create a notification for admin (optional)
    const notif = new Notification({
      userId: null,
      title: 'Enquiry Replied',
      message: `Reply sent to ${enquiry.name} (${enquiry.email})`,
      type: 'Info',
      isGeneral: true
    });
    await notif.save();
    
    res.json({ 
      success: true, 
      message: 'Reply sent successfully!' 
    });
    
  } catch (error) {
    console.error('❌ Reply error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error sending reply.' 
    });
  }
});
// =======================
// MEAL PLAN MANAGEMENT
// =======================

// Get all meal plans
app.get('/api/mealplan', async (req, res) => {
  try {
    let mealPlans = await MealPlan.find().sort({ day: 1 });
    
    // If no meal plans exist, create default ones
    if (mealPlans.length === 0) {
      const defaultMeals = [
        { day: 'Monday', breakfast: '🌾 Oatmeal with fresh fruits', lunch: '🍚 Rice, dal, vegetable curry', snacks: '🍎 Fruit salad', dinner: '🫓 Chapati, paneer curry' },
        { day: 'Tuesday', breakfast: '🍚 Poha with nuts', lunch: '🫓 Roti, dal, sabzi', snacks: '🥛 Yogurt with honey', dinner: '🍚 Rice, vegetable soup' },
        { day: 'Wednesday', breakfast: '🥞 Idli with sambar', lunch: '🫓 Chapati, mixed vegetable curry', snacks: '🌱 Sprout salad', dinner: '🫓 Roti, dal, salad' },
        { day: 'Thursday', breakfast: '🍚 Upma with chutney', lunch: '🍚 Rice, rajma curry', snacks: '🥤 Fruit smoothie', dinner: '🫓 Chapati, vegetable curry' },
        { day: 'Friday', breakfast: '🫓 Paratha with curd', lunch: '🍚 Rice, chole, salad', snacks: '🥜 Nuts and seeds', dinner: '🫓 Roti, dal, sabzi' },
        { day: 'Saturday', breakfast: '🥪 Sandwich with veggies', lunch: '🍚 Rice, sambar, vegetables', snacks: '🌽 Boiled corn', dinner: '🫓 Chapati, paneer masala' },
        { day: 'Sunday', breakfast: '🥞 Dosa with chutney', lunch: '🫓 Roti, dal makhani', snacks: '🍇 Fruit bowl', dinner: '🍚 Rice, mixed vegetable curry' }
      ];
      
      await MealPlan.insertMany(defaultMeals);
      mealPlans = await MealPlan.find().sort({ day: 1 });
    }
    
    res.json({ success: true, mealPlans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single day meal plan
app.get('/api/mealplan/:day', async (req, res) => {
  try {
    const mealPlan = await MealPlan.findOne({ day: req.params.day });
    if (!mealPlan) {
      return res.json({ success: false, message: 'Meal plan not found' });
    }
    res.json({ success: true, mealPlan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update meal plan (Admin only)
app.put('/api/mealplan/:day', isAdminLoggedIn, async (req, res) => {
  try {
    const { breakfast, lunch, snacks, dinner } = req.body;
    const day = req.params.day;
    
    const mealPlan = await MealPlan.findOneAndUpdate(
      { day },
      { 
        breakfast, 
        lunch, 
        snacks, 
        dinner,
        updatedBy: req.session.user?.id || req.session.admin?.id,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );
    
    res.json({ success: true, message: `${day} meal plan updated successfully`, mealPlan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reset all meal plans to default (Admin only)
app.post('/api/mealplan/reset', isAdminLoggedIn, async (req, res) => {
  try {
    const defaultMeals = [
      { day: 'Monday', breakfast: '🌾 Oatmeal with fresh fruits', lunch: '🍚 Rice, dal, vegetable curry', snacks: '🍎 Fruit salad', dinner: '🫓 Chapati, paneer curry' },
      { day: 'Tuesday', breakfast: '🍚 Poha with nuts', lunch: '🫓 Roti, dal, sabzi', snacks: '🥛 Yogurt with honey', dinner: '🍚 Rice, vegetable soup' },
      { day: 'Wednesday', breakfast: '🥞 Idli with sambar', lunch: '🫓 Chapati, mixed vegetable curry', snacks: '🌱 Sprout salad', dinner: '🫓 Roti, dal, salad' },
      { day: 'Thursday', breakfast: '🍚 Upma with chutney', lunch: '🍚 Rice, rajma curry', snacks: '🥤 Fruit smoothie', dinner: '🫓 Chapati, vegetable curry' },
      { day: 'Friday', breakfast: '🫓 Paratha with curd', lunch: '🍚 Rice, chole, salad', snacks: '🥜 Nuts and seeds', dinner: '🫓 Roti, dal, sabzi' },
      { day: 'Saturday', breakfast: '🥪 Sandwich with veggies', lunch: '🍚 Rice, sambar, vegetables', snacks: '🌽 Boiled corn', dinner: '🫓 Chapati, paneer masala' },
      { day: 'Sunday', breakfast: '🥞 Dosa with chutney', lunch: '🫓 Roti, dal makhani', snacks: '🍇 Fruit bowl', dinner: '🍚 Rice, mixed vegetable curry' }
    ];
    
    for (const meal of defaultMeals) {
      await MealPlan.findOneAndUpdate(
        { day: meal.day },
        { ...meal, updatedAt: new Date() },
        { upsert: true }
      );
    }
    
    res.json({ success: true, message: 'All meal plans reset to default' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =======================
// FACE RECOGNITION ROUTES
// =======================

// Register face for a user (Admin only)
app.post('/api/face/register', isAdminLoggedIn, async (req, res) => {
  try {
    const { userId, faceDescriptor, imageUrl } = req.body;
    
    if (!userId || !faceDescriptor) {
      return res.json({ success: false, message: 'User ID and face descriptor are required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    let existing = await FaceRecognition.findOne({ userId });
    
    if (existing) {
      existing.faceDescriptor = faceDescriptor;
      existing.lastUpdated = new Date();
      existing.imageUrl = imageUrl || existing.imageUrl;
      existing.registeredBy = req.session.adminId || null;
      await existing.save();
      return res.json({ success: true, message: 'Face updated successfully' });
    } else {
      const faceRecord = new FaceRecognition({
        userId,
        faceDescriptor,
        imageUrl: imageUrl || null,
        registeredBy: req.session.adminId || null
      });
      await faceRecord.save();
      return res.json({ success: true, message: 'Face registered successfully' });
    }
  } catch (error) {
    console.error('Face registration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all registered faces (Admin only)
app.get('/api/face/registered', isAdminLoggedIn, async (req, res) => {
  try {
    const faces = await FaceRecognition.find()
      .populate('userId', 'name email phone')
      .sort({ registeredAt: -1 });
    
    res.json({ success: true, faces });
  } catch (error) {
    console.error('Error fetching faces:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete face registration (Admin only)
app.delete('/api/face/delete/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const result = await FaceRecognition.findOneAndDelete({ userId: req.params.userId });
    
    if (!result) {
      return res.json({ success: false, message: 'Face registration not found' });
    }
    
    res.json({ success: true, message: 'Face registration deleted successfully' });
  } catch (error) {
    console.error('Error deleting face:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check in with face recognition
app.post('/api/attendance/face-checkin', async (req, res) => {
  try {
    const { faceDescriptor } = req.body;
    
    if (!faceDescriptor) {
      return res.json({ success: false, message: 'Face descriptor required' });
    }
    
    // Find user by face
    const allFaces = await FaceRecognition.find({ verified: true }).populate('userId', 'name email');
    let matchedUser = null;
    let minDistance = 0.6;
    
    for (const face of allFaces) {
      const distance = faceapi.euclideanDistance(faceDescriptor, face.faceDescriptor);
      if (distance < minDistance) {
        minDistance = distance;
        matchedUser = face.userId;
      }
    }
    
    if (!matchedUser) {
      return res.json({ success: false, message: 'Face not recognized. Please register first.' });
    }
    
    const userId = matchedUser._id;
    
    // Check if there's an active check-in
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeRecord = await Attendance.findOne({
      user: userId,
      date: { $gte: today },
      checkOut: null
    });
    
    if (activeRecord) {
      return res.json({ success: false, message: 'Already checked in! Please check out first.' });
    }
    
    const attendance = new Attendance({
      user: userId,
      date: new Date(),
      checkIn: new Date(),
      faceVerified: true,
      markedBy: userId
    });
    await attendance.save();
    
    res.json({ 
      success: true, 
      message: 'Check-in successful',
      user: matchedUser,
      attendance
    });
  } catch (error) {
    console.error('Face check-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check out with face recognition
app.post('/api/attendance/face-checkout', async (req, res) => {
  try {
    const { faceDescriptor } = req.body;
    
    if (!faceDescriptor) {
      return res.json({ success: false, message: 'Face descriptor required' });
    }
    
    const allFaces = await FaceRecognition.find({ verified: true }).populate('userId', 'name email');
    let matchedUser = null;
    let minDistance = 0.6;
    
    for (const face of allFaces) {
      const distance = faceapi.euclideanDistance(faceDescriptor, face.faceDescriptor);
      if (distance < minDistance) {
        minDistance = distance;
        matchedUser = face.userId;
      }
    }
    
    if (!matchedUser) {
      return res.json({ success: false, message: 'Face not recognized. Please register first.' });
    }
    
    const userId = matchedUser._id;
    
    // Find active check-in
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeRecord = await Attendance.findOne({
      user: userId,
      date: { $gte: today },
      checkOut: null
    });
    
    if (!activeRecord) {
      return res.json({ success: false, message: 'No active check-in found' });
    }
    
    activeRecord.checkOut = new Date();
    await activeRecord.save();
    
    res.json({ 
      success: true, 
      message: 'Check-out successful',
      user: matchedUser,
      attendance: activeRecord
    });
  } catch (error) {
    console.error('Face check-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function for Euclidean distance (if face-api.js not available on server)
function euclideanDistance(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    sum += Math.pow(descriptor1[i] - descriptor2[i], 2);
  }
  return Math.sqrt(sum);
}

// ========== ANALYTICS MIDDLEWARE ==========
// Analytics Middleware to track user activity
app.use(async (req, res, next) => {
  // Skip tracking for analytics routes to avoid infinite loop
  if (req.path.startsWith('/api/analytics')) {
    return next();
  }
  
  // Only track if user is logged in
  if (req.session.user || req.session.admin) {
    const start = Date.now();
    const originalSend = res.send;
    
    // Track response time
    res.send = function(data) {
      res.responseTime = Date.now() - start;
      return originalSend.call(this, data);
    };
    
    // Store analytics after response completes
    res.on('finish', async () => {
      try {
        const userId = req.session.user?.id || req.session.admin?.id || null;
        const userRole = req.session.user?.role || 'admin';
        const userEmail = req.session.user?.email || null;
        
        if (userId) {
          // Determine action type based on endpoint
          let actionType = 'page_view';
          const path = req.path;
          
          if (path.includes('/api/attendance/checkin')) actionType = 'mark_attendance';
          else if (path.includes('/api/attendance/checkout')) actionType = 'mark_attendance';
          else if (path.includes('/user/complaint')) actionType = 'create_complaint';
          else if (path.includes('/admin/complaints') && req.method === 'PUT') actionType = 'update_complaint';
          else if (path.includes('/user/payments')) actionType = 'create_payment';
          else if (path.includes('/rooms/allocate')) actionType = 'book_room';
          else if (path.includes('/admin/notifications')) actionType = 'send_notification';
          else if (path.includes('/user/register')) actionType = 'register_user';
          else if (path.includes('/user/login')) actionType = 'login';
          else if (path.includes('/user/logout')) actionType = 'logout';
          else if (path.includes('/dashboard')) actionType = 'view_dashboard';
          else if (path.includes('/attendance')) actionType = 'view_attendance';
          else if (path.includes('/complaints')) actionType = 'view_complaint';
          else if (path.includes('/payments')) actionType = 'view_payment';
          else if (path.includes('/rooms')) actionType = 'view_room';
          else if (path.includes('/mealplan')) actionType = 'view_meal_plan';
          else if (path.includes('/notifications')) actionType = 'view_notification';
          
          await Analytics.create({
            userId: userId,
            userRole: userRole,
            userEmail: userEmail,
            actionType: actionType,
            page: req.path,
            endpoint: req.originalUrl,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            responseTime: res.responseTime || 0,
            metadata: {
              method: req.method,
              statusCode: res.statusCode
            }
          }).catch(err => console.error('Analytics log error:', err));
        }
      } catch(err) {
        // Don't let analytics errors break your app
        console.error('Analytics error:', err.message);
      }
    });
  }
  
  next();
});
// ========== END OF ANALYTICS MIDDLEWARE ==========

// ========== ANALYTICS ROUTES ==========

// Get analytics stats for dashboard
app.get('/api/analytics/stats', isAdminLoggedIn, async (req, res) => {
  try {
    // Total users
    const totalUsers = await User.countDocuments();
    
    // Total page views
    const totalPageViews = await Analytics.countDocuments({ actionType: 'page_view' });
    
    // Active users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsers = await Analytics.distinct('userId', { 
      timestamp: { $gte: thirtyDaysAgo } 
    });
    
    // Most viewed pages
    const pageViews = await Analytics.aggregate([
      { $match: { actionType: 'page_view' } },
      { $group: { _id: '$page', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // User activity by role
    const roleActivity = await Analytics.aggregate([
      { $group: { _id: '$userRole', count: { $sum: 1 } } }
    ]);
    
    // Daily activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dailyActivity = await Analytics.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      { $group: { 
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, 
        count: { $sum: 1 } 
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Action type distribution
    const actionDistribution = await Analytics.aggregate([
      { $group: { _id: '$actionType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPageViews,
        activeUsers: activeUsers.length,
        pageViews,
        roleActivity,
        dailyActivity,
        actionDistribution
      }
    });
  } catch (err) {
    console.error('Analytics stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching analytics stats' 
    });
  }
});

// Get user analytics (for a specific user)
app.get('/api/analytics/user/:userId', isAdminLoggedIn, async (req, res) => {
  try {
    const userId = req.params.userId;
    const analytics = await Analytics.find({ userId })
      .sort({ timestamp: -1 })
      .limit(100)
      .populate('userId', 'name email');
    res.json({ success: true, analytics });
  } catch (err) {
    console.error('User analytics error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching user analytics' 
    });
  }
});

// Get analytics by date range
app.get('/api/analytics/date-range', isAdminLoggedIn, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = {};
    
    if (from) {
      query.timestamp = { $gte: new Date(from) };
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.timestamp = { ...query.timestamp, $lte: toDate };
    }
    
    const analytics = await Analytics.find(query)
      .sort({ timestamp: -1 })
      .populate('userId', 'name email')
      .limit(100);
    
    res.json({ success: true, analytics });
  } catch (err) {
    console.error('Date range analytics error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error fetching analytics by date range' 
    });
  }
});

// Track page view (frontend calls this)
app.post('/api/analytics/track', async (req, res) => {
  try {
    const { page, endpoint, actionType, metadata } = req.body;
    
    // Get user from session
    const userId = req.session.user?.id || req.session.admin?.id || null;
    const userRole = req.session.user?.role || 'admin';
    const userEmail = req.session.user?.email || null;
    
    if (!userId) {
      return res.json({ success: false, message: 'User not logged in' });
    }
    
    const analytics = new Analytics({
      userId,
      userRole,
      userEmail,
      actionType: actionType || 'page_view',
      page,
      endpoint,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      metadata: metadata || {}
    });
    
    await analytics.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Track analytics error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Error tracking analytics' 
    });
  }
});

// ========== END OF ANALYTICS ROUTES ==========

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));