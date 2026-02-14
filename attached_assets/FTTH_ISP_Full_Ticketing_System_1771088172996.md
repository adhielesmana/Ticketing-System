# FTTH ISP Ticketing & Maintenance Management System

## Professional Production Specification

Version: 1.0\
Target: ISP FTTH Operation (Home, Backbone, Installation)

------------------------------------------------------------------------

# 1. SYSTEM OVERVIEW

This application is designed for Internet Service Providers (ISP)
operating FTTH networks to manage:

-   Home Maintenance (24h SLA)
-   Backbone Maintenance (24h SLA)
-   New Installation (72h SLA)

Core Objectives:

-   Enforce SLA automatically
-   Prevent technician overload
-   Implement 4:2 workload ratio (Maintenance:Installation)
-   Isolate Backbone Specialist teams
-   Track technician performance
-   Provide mobile-first UI for field teams
-   Provide full administrative control & audit logs

------------------------------------------------------------------------

# 2. USER ROLES & PERMISSIONS

## 2.1 Superadmin

-   Full system access
-   Create / edit / delete tickets
-   Manual assignment & undo assignment
-   Manage SLA rules
-   Manage users
-   View all reports

## 2.2 Admin

-   View all tickets
-   Manual assign
-   Undo assignment
-   View performance dashboard

## 2.3 Helpdesk

-   Create ticket
-   Edit ticket (only before assignment)
-   View ticket status
-   Cannot assign
-   Cannot close

## 2.4 Technician

-   View assigned ticket only
-   Start work
-   Upload proof
-   Submit speedtest
-   Close ticket

------------------------------------------------------------------------

# 3. SLA POLICY

Home Maintenance: 24 Hours\
Backbone Maintenance: 24 Hours\
Installation: 72 Hours

If current_time \> sla_deadline AND status != closed:

-   status = overdue
-   perform_status = not_perform

------------------------------------------------------------------------

# 4. FULL PRISMA SCHEMA

``` prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                     String   @id @default(uuid())
  name                   String
  email                  String   @unique
  phone                  String?
  role                   Role
  isBackboneSpecialist   Boolean  @default(false)
  isActive               Boolean  @default(true)
  createdAt              DateTime @default(now())

  assignments            TicketAssignment[]
  performanceLogs        PerformanceLog[]
}

model Ticket {
  id                   String   @id @default(uuid())
  ticketNumber         String   @unique
  type                 TicketType
  priority             Priority
  status               TicketStatus @default(open)

  customerName         String
  customerPhone        String
  customerEmail        String?
  customerLocationUrl  String

  title                String
  description          String
  actionDescription    String?
  proofImageUrl        String?
  speedtestResult      String?

  slaDeadline          DateTime
  createdAt            DateTime @default(now())
  closedAt             DateTime?
  durationMinutes      Int?
  closedReason         String?
  closedNote           String?
  performStatus        PerformStatus?

  assignments          TicketAssignment[]
}

model TicketAssignment {
  id         String   @id @default(uuid())
  ticketId   String
  userId     String
  assignedAt DateTime @default(now())

  ticket     Ticket   @relation(fields: [ticketId], references: [id])
  user       User     @relation(fields: [userId], references: [id])
}

model PerformanceLog {
  id                  String   @id @default(uuid())
  userId              String
  ticketId            String
  result              PerformStatus
  completedWithinSLA  Boolean
  durationMinutes     Int
  createdAt           DateTime @default(now())

  user                User     @relation(fields: [userId], references: [id])
}

enum Role {
  superadmin
  admin
  helpdesk
  technician
}

enum TicketType {
  home_maintenance
  backbone_maintenance
  installation
}

enum Priority {
  low
  medium
  high
  critical
}

enum TicketStatus {
  open
  waiting_assignment
  assigned
  in_progress
  closed
  overdue
}

enum PerformStatus {
  perform
  not_perform
}
```

------------------------------------------------------------------------

# 5. FULL API STRUCTURE

Base URL: /api

AUTH: POST /auth/login\
POST /auth/register

TICKETS: POST /tickets\
GET /tickets\
GET /tickets/:id\
PUT /tickets/:id\
POST /tickets/:id/assign\
POST /tickets/:id/start\
POST /tickets/:id/close\
POST /tickets/:id/undo

DASHBOARD: GET /dashboard/admin\
GET /dashboard/technician\
GET /dashboard/performance

USERS: GET /users\
POST /users\
PUT /users/:id\
DELETE /users/:id

------------------------------------------------------------------------

# 6. ASSIGNMENT ENGINE (READY-TO-CODE LOGIC)

``` javascript
async function assignTicket(ticket) {

  if (ticket.type === "backbone_maintenance") {
    const backboneUsers = await prisma.user.findMany({
      where: {
        isBackboneSpecialist: true,
        assignments: {
          none: {
            ticket: {
              status: { in: ["assigned", "in_progress"] }
            }
          }
        }
      }
    })

    if (backboneUsers.length === 0) return null

    return backboneUsers[0]
  }

  const availableTech = await prisma.user.findMany({
    where: {
      role: "technician",
      isBackboneSpecialist: false,
      assignments: {
        none: {
          ticket: {
            status: { in: ["assigned", "in_progress"] }
          }
        }
      }
    }
  })

  if (availableTech.length === 0) return null

  return availableTech[0]
}
```

------------------------------------------------------------------------

# 7. UI COMPONENT BREAKDOWN

## Technician Mobile View

-   ActiveTicketCard
-   SLACountdownTimer
-   CustomerInfoCard
-   GoogleMapsButton
-   UploadProofComponent
-   SpeedtestInput
-   CloseTicketButton

## Helpdesk View

-   CreateTicketForm
-   TicketStatusTable

## Admin Dashboard

-   TicketKanbanBoard
-   ManualAssignmentPanel
-   PerformanceTable
-   OverdueAlertWidget

------------------------------------------------------------------------

# 8. PRODUCTION DEPLOYMENT GUIDE

Backend: - Node.js - Express - Prisma ORM - PostgreSQL

Frontend: - Next.js - Tailwind CSS

Storage: - Cloudinary (Proof Images)

Hosting Options: - Railway - DigitalOcean - VPS with Docker

Security: - JWT Authentication - HTTPS Only - Role-Based Access
Control - Audit Logging Mandatory

CRON JOBS: - SLA checker every 5 minutes - Escalation checker every 15
minutes

------------------------------------------------------------------------

# 9. BUSINESS IMPACT

This system ensures:

-   Zero technician overload
-   Automatic SLA enforcement
-   Performance accountability
-   Backbone isolation control
-   Transparent reporting
-   No more manual chasing

This is a Professional ISP FTTH Operations Platform.
