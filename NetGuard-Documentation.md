# NetGuard ISP - Ticketing & Maintenance Management System

## Complete Documentation

---

## 1. Overview

NetGuard ISP is a full-stack web application designed for Internet Service Providers operating Fiber-to-the-Home (FTTH) networks. It manages work orders, enforces SLA deadlines, tracks technician performance, and provides a complete administrative dashboard with reporting.

### Key Capabilities

- Role-based access control (4 roles)
- Ticket lifecycle management (create, assign, start, close, reject, unassign)
- Automatic SLA enforcement with visual countdown timers
- Intelligent auto-assignment system with workload balancing
- Per-technician bonus/fee configuration
- Mobile-first technician interface
- Dashboard analytics with charts
- Comprehensive reporting (tickets, bonus, performance)
- Image uploads (description, proof, speedtest)
- Database export/import with compression
- Dark/light mode support

---

## 2. User Roles & Permissions

### 2.1 Superadmin

- Full system access
- Manage all users (create, edit, delete)
- Configure system settings and bonus rates
- Create, assign, close, delete, unassign tickets
- Export and import database
- Bulk reset stale assignments
- Access all reports and dashboard

### 2.2 Admin

- Same capabilities as Superadmin
- Created and managed by Superadmin

### 2.3 Helpdesk

- Create new tickets
- Assign technicians to tickets (manual or auto)
- View ticket list and details
- View reports
- Cannot manage users or system settings
- Cannot delete tickets or unassign technicians

### 2.4 Technician

- View only their assigned tickets (mobile-first interface)
- Start work on assigned tickets
- Close tickets with proof documentation
- Request ticket rejection (requires admin approval)
- View personal performance and bonus information
- Cannot access admin features, reports, or other technicians' tickets

---

## 3. Ticket Types & SLA

| Ticket Type | SLA Deadline | Description |
|---|---|---|
| Home Maintenance | 24 hours | Fixing issues at customer's home (connection drops, slow speed, etc.) |
| Backbone Maintenance | 24 hours | Repairing main fiber network infrastructure (cable cuts, ODP damage, etc.) |
| New Installation | 72 hours | Setting up new fiber connections for new customers |

- SLA countdown starts from ticket creation time
- Visual timer shows remaining time in hours and minutes
- Overdue tickets display a red "Overdue" badge
- Overdue tickets automatically receive zero bonus when closed

---

## 4. Ticket Lifecycle (Workflow)

### 4.1 Standard Flow

```
OPEN
  |
  v
ASSIGNED (1-2 technicians assigned, manually or auto)
  |
  v
IN PROGRESS (technician taps "Start Work")
  |
  v
CLOSED (technician submits proof: photos, speedtest, action description)
```

### 4.2 Rejection Flow

```
ASSIGNED / IN PROGRESS
  |
  v
PENDING REJECTION (technician requests rejection with reason)
  |
  +---> REJECTED (admin approves rejection)
  |
  +---> ASSIGNED (admin denies rejection, ticket returns to assigned)
```

### 4.3 Unassign Flow

```
ASSIGNED / IN PROGRESS
  |
  v
OPEN (admin/superadmin unassigns all technicians, ticket returns to open)
```

### 4.4 Status Definitions

| Status | Meaning |
|---|---|
| Open | New ticket, no technician assigned yet |
| Assigned | 1-2 technicians assigned, work not yet started |
| In Progress | Technician has started working on the ticket |
| Closed | Work completed, proof submitted |
| Pending Rejection | Technician requested to reject, awaiting admin decision |
| Rejected | Admin approved the rejection |

---

## 5. Assignment System

### 5.1 Manual Assignment

- Helpdesk/Admin selects 1 or 2 technicians from a dropdown list
- Only active technicians are shown
- Maximum 2 technicians per ticket (team of 2)
- Specialist filtering applies (see section 5.3)

### 5.2 Auto-Assignment (Intelligent)

When "Auto Assign" is clicked, the system performs these steps in order:

**Step 1: Filter Eligible Technicians**
- Only active technicians (isActive = true)
- Only technicians not currently working on an in-progress ticket
- Only technicians with the "technician" role

**Step 2: Apply Specialist Rules**
- Backbone tickets: only backbone specialist technicians are eligible
- Vendor-related tickets: only vendor specialist technicians are eligible
- Home maintenance / installation tickets: only regular (non-specialist) technicians

**Step 3: Calculate Workload Scores**
For each eligible technician, the system calculates:
- Current number of active assigned tickets (fewer = better score)
- Compliance with the maintenance-to-installation ratio (see section 5.4)
- Overall availability

**Step 4: Select Best Team**
- Technicians are ranked by workload score (lowest = best)
- Top 2 technicians are selected as a team
- Both are assigned simultaneously

**Step 5: Assign**
- Ticket status changes from "Open" to "Assigned"
- Assignment type is marked as "auto"

If the system cannot find eligible technicians, it returns an error explaining why (e.g., "No available technicians" or "All technicians are busy").

### 5.2.1 Auto-Assign by Proximity (Next Ticket Selection)

When a technician finishes a ticket and requests their next assignment, the system uses proximity-based logic to pick the best next ticket. It extracts GPS coordinates from the Google Maps URL of the customer location and applies the following priority order:

**Priority 1: Overdue Tickets (Absolute Priority)**
- If any assigned ticket has passed its SLA deadline, it is selected immediately regardless of distance
- If multiple tickets are overdue, the one most overdue (earliest SLA deadline) is picked first

**Priority 2: First Ticket of the Day (No Previous Location)**
- If the technician has no previous ticket location (first job of the day), the system picks the oldest open ticket (earliest creation date)

**Priority 3: Nearby Tickets Within 2 km**
- The system calculates the distance between the technician's last completed ticket location and each candidate ticket using the Haversine formula (great-circle distance)
- Tickets within a 2 km radius are considered "nearby"
- Among nearby tickets, the oldest one (earliest creation date) is selected first
- This minimizes travel time by keeping technicians working in their current area

**Priority 4: Farther Tickets by Priority + Age**
- If no tickets are within 2 km, the system falls back to sorting by priority level (critical > high > medium > low), then by creation date (oldest first)

**How It Works:**
- Customer Location URLs (Google Maps links) are parsed to extract latitude/longitude coordinates
- The Haversine formula calculates the real-world distance between two GPS points on Earth's surface
- The 2 km proximity threshold is designed to keep technicians efficient within a local area before sending them further away

### 5.3 Specialist Categories

| Specialist Type | Eligible Ticket Types | Flag in User Profile |
|---|---|---|
| Backbone Specialist | Backbone Maintenance only | isBackboneSpecialist = true |
| Vendor Specialist | Vendor-related tickets only | isVendorSpecialist = true |
| Regular Technician | Home Maintenance, Installation | Both flags = false |

Specialists are isolated. A backbone specialist will never receive home maintenance or installation tickets, and vice versa.

### 5.4 Preference Ratio (Workload Balancing)

The system enforces a configurable maintenance-to-installation ratio (default: 4:2).

This means:
- For every 4 maintenance tickets assigned to a technician, they should receive approximately 2 installation tickets
- The auto-assign algorithm considers each technician's current ratio when scoring
- Technicians who are overloaded on one type receive a penalty score, making them less likely to receive more of the same type
- The ratio is configurable in Settings

---

## 6. Bonus / Fee System

### 6.1 How Bonuses Work

Each closed ticket generates compensation for the assigned technicians. The compensation has two components:

| Component | Description |
|---|---|
| Ticket Fee | Payment for completing the work |
| Transport Fee | Payment for travel to the customer location |

**Total Bonus = Ticket Fee + Transport Fee**

### 6.2 Fee Configuration (Two Levels)

**Level 1: Global Defaults (Settings Page)**
- Set default ticket fee and transport fee for each ticket type
- Example: Home Maintenance = Rp 50,000 ticket fee + Rp 20,000 transport fee
- These apply to all technicians unless overridden

**Level 2: Per-Technician Override (Users Page)**
- Each technician can have individual rates per ticket type
- Configured via the dollar icon next to each technician in the Users page
- Example: Senior technician gets Rp 75,000 for installations instead of the default Rp 50,000

### 6.3 Fee Calculation Logic (When Closing a Ticket)

```
For each assigned technician:
  1. Check: Does this technician have a custom fee for this ticket type?
     - YES: Use technician's custom ticket fee + transport fee
     - NO: Use global default ticket fee + transport fee from Settings
  2. Check: Is the ticket overdue (closed after SLA deadline)?
     - YES: Set bonus to 0 (zero)
     - NO: Bonus = ticket fee + transport fee
  3. Record the fee breakdown in performance log
```

### 6.4 Bonus Reports

The Bonus Summary report shows:
- Each technician's name
- Total ticket fees earned
- Total transport fees earned
- Total bonus (combined)
- Filtered by date range

---

## 7. Ticket Details & Fields

### 7.1 Customer Information

| Field | Required | Description |
|---|---|---|
| Customer Name | Yes | Full name of the customer |
| Customer Phone | Yes | Contact phone number |
| Customer Email | No | Email address |
| Customer Location URL | Yes | Google Maps link to customer address |
| Area | Auto | Automatically detected from Google Maps URL |

### 7.2 Ticket Information

| Field | Required | Description |
|---|---|---|
| Ticket ID (Custom) | Auto | Auto-generated: YYMMDD + 4-digit sequence (e.g., 2602180001) |
| Ticket Number | Auto | System-generated unique identifier (e.g., INC-123456) |
| Type | Yes | Home Maintenance, Backbone Maintenance, or Installation |
| Priority | Yes | Low, Medium, High, or Critical |
| Title | Yes | Brief description of the issue |
| Description | Yes | Detailed description of the problem |
| Description Images | No | Photos attached when creating the ticket |
| ODP Info | No | Optical Distribution Point identifier |
| ODP Location | No | Physical location of the ODP |

### 7.3 Closure Information (Filled by Technician)

| Field | Description |
|---|---|
| Action Description | What the technician did to resolve the issue |
| Proof Photos | Multiple images showing completed work |
| Speedtest Screenshot | Speed test result image |
| Speedtest Result | Speed test value (text) |
| Perform Status | "Perform" or "Not Perform" |

---

## 8. Reports

### 8.1 Tickets Report

- Lists all tickets with full details
- Filters: date range, ticket type, status
- Shows: ticket ID, customer, type, status, assigned technicians, SLA status, dates
- Exportable for record-keeping

### 8.2 Bonus Summary Report

- Shows each technician's total earnings
- Breakdown: ticket fees, transport fees, total bonus
- Filtered by date range
- Uses actual per-technician rates (not just global defaults)

### 8.3 Performance Summary Report

- Shows technician productivity metrics
- Metrics: total tickets completed, on-time completion rate, average resolution time
- Filtered by date range
- Helps identify top performers and those needing support

---

## 9. Database Export / Import

### 9.1 Export

- Creates a compressed file (.json.gz) using maximum gzip compression
- Contains ALL data:
  - Users (with hashed passwords for full restore)
  - Tickets
  - Ticket assignments
  - Performance logs
  - Technician fee configurations
  - System settings
- File naming: netguard-export-YYYY-MM-DD.json.gz
- Restricted to Admin/Superadmin only

### 9.2 Import

- Accepts both compressed (.json.gz) and plain JSON files
- Maximum file size: 50 MB
- Import process:
  1. Clears existing tickets, assignments, performance logs, and technician fees
  2. Merges users by username:
     - Existing users: properties and passwords are updated
     - New users: created with imported data (or hashed fallback password)
  3. Re-imports all tickets with new IDs
  4. Re-imports assignments with proper ID mapping (old ticket ID to new ticket ID, old user ID to new user ID)
  5. Re-imports performance logs with ID mapping
  6. Re-imports technician fee configurations with ID mapping
  7. Imports settings (key-value pairs)
  8. Runs data consistency fix (orphaned assignment check)
- After import, all UI data automatically refreshes

---

## 10. Data Consistency & Auto-Fixes

The system includes automatic data integrity checks:

### On Every Server Startup:

1. **Orphaned Assignment Fix**: Finds tickets with "assigned" / "in_progress" / "waiting_assignment" status but no active technician assignments. Resets them to "open."
2. **Legacy Overdue Fix**: Converts any tickets with old "overdue" status to "assigned."
3. **Area Backfill**: Automatically detects and fills missing area fields from Google Maps URLs.

### Scheduled Tasks:

- **Midnight Reset**: Automatically unassigns stale tickets that have been sitting in "assigned" status for more than 24 hours without progress.

### Manual Tools:

- **Bulk Reset**: Admin can manually trigger a reset of all stale assignments from the Settings page.

---

## 11. Mobile Technician Interface

Technicians get a simplified, mobile-optimized view:

- Shows only their assigned tickets
- Large, easy-to-tap action buttons
- Ticket cards show: customer name, type, area, SLA countdown
- Quick actions: Start Work, Close Ticket, Request Rejection
- Photo upload with camera integration
- Personal bonus tracking

---

## 12. Dashboard (Admin View)

The admin dashboard shows at-a-glance statistics:

- Total tickets (open, assigned, in progress, closed)
- SLA compliance rate
- Technician workload distribution
- Charts: tickets by type, tickets by status, recent activity trends
- Quick links to create tickets, view reports, manage users

---

## 13. System Settings

Configurable via the Settings page (Admin/Superadmin only):

| Setting | Description |
|---|---|
| Default Ticket Fee (per type) | Global default payment for completing each ticket type |
| Default Transport Fee (per type) | Global default travel payment for each ticket type |
| Preference Ratio | Maintenance-to-installation ratio for auto-assignment (default 4:2) |
| Custom Logo | Upload a custom logo for the application |

---

## 14. Technical Architecture (Summary)

| Component | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Library | shadcn/ui (Radix UI + Tailwind CSS) |
| Routing | Wouter |
| State Management | TanStack React Query |
| Backend | Node.js + Express.js |
| Database | PostgreSQL (Drizzle ORM) |
| Authentication | Session-based (bcrypt password hashing) |
| File Storage | S3-compatible object storage |
| Charts | Recharts |

---

*Document generated for NetGuard ISP Ticketing System*
*Last updated: February 2026*
