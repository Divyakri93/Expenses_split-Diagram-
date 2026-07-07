# DECISIONS.md: Engineering & Product Architectural Decision Log

This document serves as an exhaustive analytical ledger detailing the foundational architectural crossroads, trade-offs, and design patterns evaluated while engineering the FairShare platform. Every structural compromise has been eliminated to ensure production-grade consistency, absolute financial auditing, and sub-millisecond query performance under strict multi-tenant constraints.

---

## 1. Architectural Strategy for Ingestion: Silent Mutation vs. Interactive Monitored Ingestion

### Core Context & Problem Statement
The raw imported dataset (`expenses_export.csv`) exhibits high semantic density but severe data corruption (12 distinct anomaly patterns). The system needs to resolve these structural failures while honoring Meera's explicit constraint: *"I want to approve anything the app deletes or changes."*

### Options Evaluated
* **Option A: Automated Scrubbing & Silent Sanitization (Deterministic Fallbacks)**
    The backend ingest service applies algorithmic assumptions (e.g., auto-dropping duplicates, normalizing names via closest string metrics, hard-clamping fractional values) and bulk-commits the modifications to the database silently.
    *Pros:* Frictionless execution, minimal user latency, zero blocking UX loops.
    *Cons:* Introduces un-auditable ledger drift. Violates transactional integrity and explicitly breaks user trust by masking structural anomalies without data-owner consensus.
* **Option B: Interactive Ingestion & State-Suspension Middleware**
    The ingestion engine intercepts the file buffer, scans for specific data violations sequentially, calculates an optimized "Suggested Smart Fix", suspends database insertion, and transfers state serialization to a dedicated, high-fidelity UI review pipeline.
    *Pros:* Absolute visibility. Fully complies with user sovereignty and ledger auditing requirements.
    *Cons:* Introduces operational friction during user file uploads.

### Decision & Technical Justification
**Chosen: Option B (Interactive Ingestion Framework via Glassmorphic Stream Dashboard)**
*Rationale:* In financial ledger engineering, a silent guess is a catastrophic architectural flaw. Shifting the data-mutation responsibility to a cryptographic user-approval event guarantees data integrity. The UI leverages glassmorphic overlay indicators to transform a data-cleaning hurdle into a highly visual, premium user feedback pattern.

---

## 2. Advanced Temporal Anomaly Resolution Architecture (Dynamic Pro-Rata Scaling)

### Core Context & Problem Statement
Traditional expense split apps run static array distributions. This system must dynamically adjust liabilities for dynamic temporal group changes (e.g., Sam entering mid-month on April 8, and Meera leaving post-March 31), resolving Sam's core demand: *"Why would March electricity affect my balance?"*

### Options Evaluated
* **Option A: Hard Constraint Validation Failures (CSV Abort)**
    The server rejects any row containing split definitions pointing to an inactive or non-resident entity for that specific transaction date range.
    *Pros:* 100% immune to improper database distributions.
    *Cons:* Catastrophic user experience. Requires manual pre-processing of raw CSV metrics in third-party software (Excel) prior to re-upload.
* **Option B: Dynamic Day-Basis Pro-Rata Allocation Engine**
    The system reads the transactional date stamp, queries the calendar month dimension limits dynamically, and computes a fractional distribution constraint factor based on a user's exact active days inside that localized billing epoch.

### Decision & Technical Justification
**Chosen: Option B (Dynamic Pro-Rata Day-Basis Scaling Service)**
*Rationale:* This approach scales convenience without introducing calculation inaccuracies. For an active member who joined mid-month on April 8, the mathematical parser computes their presence parameter: $\frac{30 - 7}{30} = \frac{23}{30} \approx 76.66\%$ max liability ceiling. The algorithm scales their split capacity by this index and dynamically reflects the exact fractional redistribution across full-time group entities. For users with 0 active days in that window, liability gracefully drops to 0.00, achieving exact structural alignment with Sam's product requirement.

---

## 3. Database Selection: Relational PostgreSQL vs. Document-Oriented NoSQL

### Core Context & Problem Statement
Rohan’s strict accounting constraint requires complete auditability: *"No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses make that up."* The underlying engine must compute double-entry ledger streams that balance perfectly to zero ($\sum \Delta \equiv 0.0000$).

### Options Evaluated
* **Option A: NoSQL Document Store (MongoDB / BSON)**
    Expenses and their associated dynamic split variables are modeled as raw nested sub-documents inside a loose, agile `groups` collection array.
    *Pros:* Schema flexibility enables seamless schema mapping of unstructured or variable CSV rows without strict format alignment.
    *Cons:* Lacks native multi-document relational constraints and atomicity at scale. Calculating complex graph debt matrices across deep nested arrays results in significant CPU overhead and high risk of floating-point arithmetic drift.
* **Option B: Relational DB Store (PostgreSQL / Enterprise Schema)**
    Data models are structured into strict, isolated entity tables (`users`, `groups`, `group_members`, `expenses`, `expense_splits`) bound via referential integrity keys and cascade constraints.

### Decision & Technical Justification
**Chosen: Option B (Relational PostgreSQL Engine using Exact Numeric Types)**
*Rationale:* Financial applications require strict ACID compliance and exact data types. PostgreSQL’s rigid entity relation schema ensures that orphaned splits or dead transactions cannot exist. Furthermore, to satisfy Rohan's audit request, PostgreSQL allows us to index composite foreign keys and perform ultra-fast `JOIN` indexing across the transactional ledger table. This allows the system to trace an individual’s final balance back to its atomic components in sub-millisecond query execution speeds. Crucially, raw JavaScript floats are banned in favor of the **`NUMERIC(12,4)`** storage datatype to eliminate binary fraction calculation leaks.

---

## 4. Ingestion Memory Invalidation Strategy: DB Staging Tables vs. In-Memory State Pipeline

### Core Context & Problem Statement
During the interactive validation stream, the unverified, dirty CSV data must be temporarily staged and monitored while the user corrects errors before final database storage.

### Options Evaluated
* **Option A: Relational SQL Staging Database Tables**
    Raw unverified rows are written to a temporary PostgreSQL table (`staging_expenses`). Once corrections are applied, rows are migrated to the production ledger table, and the staging rows are dropped.
    *Pros:* Durable data persistence. If a user loses internet connectivity mid-upload, the state remains intact on the server.
    *Cons:* Significant database write I/O overhead. Requires implementing complex database cron sweepers to drop orphaned rows from users who close their sessions mid-import.
* **Option B: Volatile In-Memory Streams via JSON Payload Parsing**
    The server streams the file via `csv-parser` memory buffers, aggregates structural anomalies into a JSON validation schema response payload, and ships the state directly to React's front-end local state engine.

### Decision & Technical Justification
**Chosen: Option B (In-Memory Frontend State Pipeline)**
*Rationale:* By minimizing database operations, this architecture isolates the transactional database from un-sanitized, malicious, or malformed data injections. The relational tables are only touched during a singular atomic unit of execution once the final payload is user-approved and structurally clean. This approach reduces database storage bloat and provides a lightning-fast, zero-latency user experience during interactive step edits.

---

## 5. Audit Log Persistence Architecture for CSV Fixes

### Core Context & Problem Statement
The app must permanently log every sanitization change (e.g., "Row 6: Comma stripped", "Row 31: Meera removed from split") for compliance reporting, compliance transparency, and generation of the final `Import Report`.

### Options Evaluated
* **Option A: Isolated Audit Ledger Table (`normalization_logs`)**
    A distinct relational table that tracks structural schema modifications using a row-by-row relational audit approach.
    *Pros:* Clean normalization architecture. Highly flexible database querying capabilities.
    *Cons:* Introduces table sprawl and requires an additional join operation during basic invoice fetching queries.
* **Option B: Inline Serialized Text Append Within Core Notes Entity**
    System modifications are serialized into a standard text signature tag (e.g., `[SYSTEM_CORRECTION]: Normalized relative weights due to 110% overflow`) and appended directly onto the target expense's native `notes` database field.

### Decision & Technical Justification
**Chosen: Option B (Inline Serialized JSON Injection Within Notes Column)**
*Rationale:* This design avoids schema bloat by storing the audit data exactly where it is used. Since the audit report is only required when looking at that specific transaction’s history, embedding this log inside the existing variable-length string column avoids the need for heavy cross-table writes. This ensures the historical data trail remains directly attached to the ledger record permanently without increasing index sizes or database cost overhead.