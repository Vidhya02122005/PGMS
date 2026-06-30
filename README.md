# PGMS – Paying Guest Management System

PGMS (Paying Guest Management System) is a full-stack web application developed to simplify the management of paying guest accommodations. The application provides a centralized platform for administrators to manage rooms, tenants, attendance, payments, complaints, and notifications, while offering tenants a secure and user-friendly portal for daily activities.

## Live Demo

**Application:** https://pgms-0b5t.onrender.com/

> **Note:** The application is deployed on Render's free tier. The initial request may take a few seconds if the server is inactive.

## Demo Credentials

### Administrator

- **Login:** https://pgms-0b5t.onrender.com/admin/login.html
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

### Tenant

- Register a new account using the **Register** page.

## Features

- Secure Authentication and Authorization
- Role-Based Access Control
- Room Allocation and Management
- Face Recognition-Based Attendance
- Payment Management
- Complaint Management
- Notification System
- Analytics Dashboard
- Responsive User Interface

## Technology Stack

### Frontend

- HTML5
- CSS3
- JavaScript (ES6)
- Chart.js
- Font Awesome

### Backend

- Node.js
- Express.js

### Database

- MongoDB
- Mongoose

### Authentication & Security

- bcrypt
- Express Session
- Google OAuth 2.0
- Nodemailer

### AI Integration

- face-api.js

## Installation

### Prerequisites

- Node.js 18+
- MongoDB 6+
- npm

### Clone the Repository

```bash
git clone https://github.com/Vidhya02122005/PGMS.git
cd PGMS
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file in the project root.

```env
PORT=3000
NODE_ENV=development

MONGO_URL=your_mongodb_connection_string

SESSION_SECRET=your_session_secret

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123

EMAIL=your_email@gmail.com
EMAIL_PASS=your_app_password

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Run the Application

```bash
npm start
```

The application will be available at:

```
http://localhost:3000
```

## Future Enhancements

- Online Payment Gateway Integration
- Mobile Application
- Report Generation (PDF/Excel)
- Email and SMS Notifications
- Multi-Property Support

## License

This project is licensed under the MIT License.

## Author

**Vidhya S**

B.Tech Computer Science Engineering

- **GitHub:** https://github.com/Vidhya02122005
- **LinkedIn:** https://www.linkedin.com/in/vidhya-s02/
