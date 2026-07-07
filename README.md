# FairShare: Intelligent Shared Expense Ledger

An ultra-modern, Glassmorphic PERN stack application explicitly built to ingest dirty CSV ledgers, intercept structural anomalies, and mathematically resolve complex temporal boundaries (e.g., members moving in/out mid-month). 

This application was engineered to fulfill the exact constraints of the 4-person flat (Aisha, Rohan, Priya, Meera) plus Dev and Sam. 

## 🎯 Fulfilling the Flatmates' Core Requests
1. **Aisha ("One number per person"):** Handled via the **Settlement Matrix**, which automatically reduces all complex group debts into direct, optimized P2P payments (Who pays whom, how much, done).
2. **Rohan ("No magic numbers"):** Handled via the **Audit Trail Ledger View**, providing a complete double-entry breakdown of every single transaction and its net impact on his balance.
3. **Priya ("Dollar is not a rupee"):** Handled via the **Multi-Currency Engine**, which intercepts foreign currencies (e.g., `USD`) and applies a rigorous exchange rate to `INR` base amounts.
4. **Sam ("Moved in mid-April"):** Handled via the **Temporal Boundary Interceptor**, which dynamically intercepts `MID_MONTH_JOINER` anomalies and calculates exact active days (e.g., 23/30 days) to propose an accurate fractional pro-rata split.
5. **Meera ("Approve anything deleted/changed"):** Handled via the **Interactive Glassmorphic Validation Stream**. The system *never* silently drops or guesses data. Every single anomaly is paused, highlighted, and requires explicit user approval or manual override.

## ⚙️ Core Stack & AI Usage
- **Database:** PostgreSQL (Relational DB for absolute ledger integrity)
- **Backend:** Node.js, Express, Sequelize, fast-csv
- **Frontend:** React, Vite, Tailwind CSS, Lucide React
- **AI Collaborator:** Google DeepMind Advanced Agentic Coding System. *(See `AI_USAGE.md` for a complete breakdown of prompt engineering, architectural collaboration, and diagnostic flaw patching).*

## 🚀 Deployment & Setup Instructions

### 1. Database Setup
Ensure PostgreSQL is installed and running on your local machine.
```bash
# Log into psql and create the database
psql -U postgres
CREATE DATABASE expenses_db;
```

### 2. Backend Installation
Open a terminal and navigate to the `backend` directory.
```bash
cd backend
npm install
```

### 3. Environment Variable Configuration (`.env`)
Create a `.env` file in the root of the `backend` directory:
```env
PORT=5000
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/expenses_db
JWT_SECRET=your_super_secret_jwt_key
```

### 4. Database Migrations & Startup
The backend uses Sequelize to auto-sync the ER schema. 
```bash
# Start the backend server
node server.js
```

### 5. Frontend Installation & Startup
Open a completely separate terminal window and navigate to the `frontend` directory.
```bash
cd frontend
npm install
# Start the Vite React development server
npm run dev
```

### 6. Usage & Testing the CSV Importer
Navigate to `http://localhost:5173` in your browser.
1. Sign up / Login.
2. Create a Group and add the flatmates.
3. Click **CSV Import Wizard**.
4. Upload `expenses_export.csv` to trigger the Anomaly Detection engine.
5. Interactively resolve the anomalies, view the **CSV Changes Log** tab for the audit trail, and commit the clean data to PostgreSQL.
