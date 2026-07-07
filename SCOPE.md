# SCOPE.md: Data Ingestion Architecture, Anomaly Log & Relational Schema

This document details the engineering specifications of the Ingest & Pipeline Sanitizer engine, the automated anomaly logging policies, and the PostgreSQL relational database schema optimized for zero-loss financial ledger execution.

---

## 1. Automated Anomaly Log & Universal Resolution Policies

The `csvSanitizer.js` module treats incoming raw multi-user files as a stream of unverified mutations. The pipeline is architected to catch anomalies, isolate the faulty structural blocks, compute a deterministic corrected safe-state, and visually surface the breakdown to the user via interactive glassmorphic validation views instead of running silent data overrides.

| CSV Data Problem | Algorithmic Detection Logic | Production Engineering Resolution Policy (Source of Truth) |
| :--- | :--- | :--- |
| **Payer Omission** | Checks if `paid_by` string parameter evaluates to null, empty, or fails string length validation after trimming. | **State Blocked.** System flags row state as `CRITICAL_MISSING_DATA`. Transacting to ledger tables is suspended until the user interacts with the UI dropdown to explicitly map a valid authenticated User ID. |
| **Financial Currency Inconsistencies** | Regular expression `/[^\d.-]/g` scans the incoming balance string arrays for layout anomalies like commas (`1,200`). | **Arbitrage Protection.** Commas are programmatically stripped from the text string. The clean token is passed to `Big.js` for execution. Raw JS floating-point conversion (`parseFloat`) is strictly banned to prevent structural data decay. |
| **Floating-Point Overflows** | Intercepts numeric input sizes exceeding two decimal places (e.g., `899.995`). | **Deterministic Financial Rounding.** Applies Half-Even Rounding (Banker's Rounding) on the database mapping layer (`NUMERIC(12,4)`) and backend services, clamping outputs to exactly 2 decimal places to maintain net group balance equilibrium ($\sum \Delta \equiv 0$). |
| **Entity Inconsistency / Name Typos** | Fuzzy token matching (Levenshtein Distance algorithm with an execution threshold constraint $\le 2$) cross-checks naming variants (e.g., `Priya S`, `priya`) against the database user registry. | **Entity Normalization.** Case-insensitive sanitization maps varied name strings to a unified, distinct relational primary key `user_id`. This prevents balance leakage across duplicate or phantom sub-profiles. |
| **Duplicate Transaction Collision** | Hashes input vectors using a composite cryptomap: `MD5(date + lower_case(description) + amount + paid_by)`. Catches semantic intersection blocks (e.g., "Dinner at Thalassa" vs "Thalassa dinner"). | **Interactive Concurrency Control.** The pipeline flags intersections as a `POTENTIAL_DUPLICATE`. The transaction is safely cached in global state, forcing a UI alert ("Meera's Box") requiring explicit user action to drop, merge, or force commit. |
| **Non-Standard Date Mapping** | A multi-token verification array maps input string records against ISO-8601 formatting rules to catch variant inputs (`YYYY-MM-DD`, `DD/MM/YYYY`, `MMM DD`). | **Temporal Standardization.** Parses arbitrary time markers using robust date utilities, converting every entry to unified `YYYY-MM-DD` standard ISO elements before running ledger computations or PostgreSQL indexing. |
| **Settlement Interception** | Text mining logic parses the description parameter using an array sequence containing lexical markers like `"paid back"`, `"settled"`, `"repaid"`. | **Transaction Rerouting.** Intercepts the record entry, flags `is_settlement: true`, and bypasses the shared expense allocation algorithm. The value is routed to a peer-to-peer (P2P) debt reduction engine to adjust current group balances. |
| **Percentage Distribution Errors** | Validates internal split weights across custom entry streams, verifying if the target equation results in an unbalanced calculation ($\sum\% \neq 100\%$, e.g., $30+30+30+20=110\%$). | **Dynamic Normalization.** Throws a `MATH_OVERFLOW` warning state. Automatically normalizes the relative ratios ($W_i = \frac{p_i}{\sum p}$) to 100%, updating the schema visualization while maintaining user allocation intents. |
| **Missing Currency Indicators** | Scans if the incoming string record length inside the explicit currency column parameter is zero or undefined. | **Fallback Configuration.** Inherits the fallback configuration values declared in the Group's primary parameter records (system defaults to `INR`). |
| **Cross-Border Multi-Currency Assets** | Evaluates the string currency code array. Identifies non-base transaction components (e.g., `USD` inputs mapped within an `INR` group design). | **Foreign Exchange Mapping.** Couples calculation chains with a deterministic historical conversion rate ($1 \text{ USD} = 83.50 \text{ INR}$). Keeps the raw foreign inputs (`original_currency`) alongside normalized base fields for audit tracking. |
| **Negative Input Inversion** | Parses if an absolute transaction balance string contains a negative prefix (`-30`). | **Transaction Inversion Layer.** Re-classifies the row entry as a `Refund`. The system processes the absolute amount as a positive value but programmatically reverses the transaction topology: the payer is credited, and split entities are moved to debit frames. |
| **Dynamic Membership Exclusions** | Cross-references individual transaction timestamps against a member's active occupancy logging metrics: `group_members.joined_at` and `group_members.left_at`. | **Universal Pro-Rata Temporal Split Engine.** Evaluates user active footprints relative to total calendar days in that billing month. If active days equal 0 (e.g., Meera in April), liability drops to `0.00`. If a user is a mid-month entry (e.g., Sam on April 8, active for 23/30 days), their liability scales by $\frac{\text{Active Days}}{\text{Total Days in Month}}$. The remainder is dynamically absorbed by full-time residents. |

---

## 2. PostgreSQL Entity-Relationship (ER) Schema

To maintain exact balances and prevent transactional anomalies, the platform uses a highly normalized relational database schema with referential integrity constraints and performance indexes.

```sql
-- Enable UUID extension for security against enumeration attacks
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Entity
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Groups Entity
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    base_currency VARCHAR(3) DEFAULT 'INR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Temporal Group Members Ledger (Tracks entry/exit over time)
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at DATE NOT NULL,
    left_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_timeline CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- 4. Expenses Ledger Entity
CREATE TYPE split_enum AS ENUM ('equal', 'unequal', 'percentage', 'share');
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    paid_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate_to_base NUMERIC(12, 6) DEFAULT 1.000000,
    split_type split_enum NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    is_settlement BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Granular Expense Splits Entity (Stores final computed exact amounts)
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    calculated_share_amount NUMERIC(12, 4) NOT NULL,
    raw_split_value NUMERIC(12, 4), -- Stores inputted %, share value or raw money
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PERFORMANCE OPTIMIZATION INDEXES
CREATE INDEX idx_group_members_timeline ON group_members(group_id, user_id, joined_at, left_at);
CREATE INDEX idx_expenses_group_date ON expenses(group_id, date);
CREATE INDEX idx_splits_expense_user ON expense_splits(expense_id, user_id);
