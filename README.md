# IQMath Learning Management System

A full-stack Learning Management System complete with payment integration, AI features, an interactive code compiler, and secure authentication. 

Official repository: https://github.com/iqmathanalytics/iqmathlms_platform

## 🏗️ Project Architecture
This project is divided into two main parts:
- **Backend:** FastAPI, PostgreSQL, SQLAlchemy, Asyncpg, Python-Jose (JWT Authentication)
- **Frontend:** React, Vite, Tailwind CSS, Firebase (OTP), Framer Motion, Recharts

## 📋 Prerequisites
Before you begin, ensure you have the following installed on your machine:
- Node.js (v18+)
- Python 3.9+
- TiDB Cloud (MySQL-compatible) or PostgreSQL

---

## 🔐 Environment Variables (.env)

You must create a `.env` file in both the `backend` and `frontend` directories before starting the project.

### Backend (`backend/.env`)
Create a new file `backend/.env` and add the following keys. Replace placeholders with your own actual values where applicable.

```ini
# SECURITY
SECRET_KEY="supersecretkey_change_this_in_production"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=60

# DATABASE
# PostgreSQL example:
# DATABASE_URL="postgresql://user:password@host:5432/dbname"
#
# TiDB/MySQL example:
# DATABASE_URL="mysql://user:password@host:4000/test?ssl_verify_cert=true&ssl_verify_identity=true"
DATABASE_URL="your_database_url"

# RAZORPAY PAYMENT
RAZORPAY_KEY_ID="your_razorpay_key_id"
RAZORPAY_KEY_SECRET="your_razorpay_secret"

# GEMINI AI
GEMINI_API_KEY="your_gemini_api_key"

# EMAIL CONFIGURATION (Brevo)
EMAIL_SENDER="your_email@gmail.com"
BREVO_API_KEY="your_brevo_api_key"

# Code execution (optional — Python on-server; C++/Java via Judge0 if no local compilers)
# JUDGE0_API_URL=https://ce.judge0.com
# JUDGE0_RAPIDAPI_HOST=judge0-ce.p.rapidapi.com
# JUDGE0_RAPIDAPI_KEY=
```

### Frontend (`frontend/.env`)
Create a new file `frontend/.env` and configure your API and Firebase parameters:

```ini
# --- API CONNECTION ---
VITE_API_URL=http://localhost:8000/api/v1  # or your production backend URL

# --- RAZORPAY ---
VITE_RAZORPAY_KEY_ID="your_razorpay_key_id"
VITE_RAZORPAY_PAYLINK_URL="https://razorpay.me/iqmathtechnologies"

# --- FIREBASE CONFIG ---
VITE_FIREBASE_API_KEY="your_firebase_api_key"
VITE_FIREBASE_AUTH_DOMAIN="your_firebase.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_firebase_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_firebase.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"
VITE_FIREBASE_MEASUREMENT_ID="your_measurement_id"
```

Firebase console for this project:
https://console.firebase.google.com/project/iqmath-lms/overview

---

## 🚀 Installation & Running the Project

### 1. Setting up the Backend
Navigate to the `backend` directory, install dependencies, and run the server.

```bash
cd backend

# Create a virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\activate
# On MacOS/Linux:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Run database migrations (if alembic is set up)
alembic upgrade head

# Start the FastAPI backend server
uvicorn main:app --reload
```
The backend API will run on `http://localhost:8000`. You can access the automatic interactive docs at `http://localhost:8000/docs`.

### 2. Setting up the Frontend
Open a new terminal session, navigate to the `frontend` directory, install the node modules, and start the development server.

```bash
cd frontend

# Install Node modules
npm install

# Start the Vite development server
npm run dev
```
The frontend application will normally host on `http://localhost:5173`.

### 3. Database Seeding (Optional)
If you need to seed initial users into the database, you can run the provided scripts from the project root while your python virtual environment is active.
Before running these, ensure you configure them to match your local database settings.

```bash
# Wait until your local database server is running
python seed_admin.py
python seed_student.py
```
