# TransitOps — Build Blueprint (8-Hour Hackathon)

## 0. Direct Assessment

This is a **CRUD + state-machine + RBAC** problem wearing a "transport ops" costume. There is no hard algorithmic core (no routing, no optimization, no real-time GPS) — the entire difficulty is in getting the **status transitions and validation rules airtight** and shipping a clean UI in 8 hours. Judges will poke at exactly the workflow in Section 5 of the brief (Van-05 / Alex). If that sequence doesn't work flawlessly live, you lose regardless of how many bonus features you bolt on.

Reasonable time allocation for 8 hours: **1 hr schema+auth, 3 hrs core CRUD+state machine, 1.5 hrs dashboard/reports, 1 hr UI polish, 1 hr bonus features, 30 min buffer/demo rehearsal.** Don't touch dark mode or PDF export until the mandatory list is 100% done and demoed once end-to-end.

---

## 1. Tech Stack Recommendation

| Layer | Pick | Why (hackathon-optimized) |
|---|---|---|
| Frontend | **React (Vite) + Tailwind or Bootstrap + Chart.js** | Fast scaffolding, component reuse across 4 roles, Chart.js gives bonus charts in minutes |
| Backend | **Node.js + Express** | Same language as frontend, JSON everywhere, minimal ceremony |
| DB | **SQLite (better-sqlite3) or Postgres if your team knows it** | Zero-config, synchronous API, file-based — no DB server to babysit during a demo |
| Auth | **JWT (jsonwebtoken) + bcryptjs** | Stateless, RBAC via role claim in token payload |
| State mgmt (FE) | React Context or Zustand | Avoid Redux — too much boilerplate for 8 hrs |
| Styling | Bootstrap 5 (fastest) or Tailwind (nicer, slightly slower to wire) | Pick whichever your team has muscle memory in |

Avoid: microservices, Docker orchestration, GraphQL, ORMs you haven't used before. Every hour spent on infra is an hour not spent on business rules, and business rules are what's graded.

If your team is weaker on frontend build tooling, skip Vite/React entirely and ship a **single-page vanilla JS app** (HTML + fetch + Bootstrap CDN + Chart.js CDN) served as static files by Express. It's less impressive on a resume but it removes an entire class of build failures on demo day.

---

## 2. Data Model

```
users
  id, name, email (unique), password_hash, role
  role ∈ {fleet_manager, driver, safety_officer, financial_analyst, admin}

vehicles
  id, reg_number (unique, NOT NULL), name, type, max_load_capacity,
  odometer, acquisition_cost, status, region
  status ∈ {Available, On Trip, In Shop, Retired}

drivers
  id, name, license_number, license_category, license_expiry_date,
  contact_number, safety_score, status
  status ∈ {Available, On Trip, Off Duty, Suspended}

trips
  id, source, destination, vehicle_id (FK), driver_id (FK),
  cargo_weight, planned_distance, actual_distance, fuel_consumed,
  status, created_at, dispatched_at, completed_at, cancelled_at
  status ∈ {Draft, Dispatched, Completed, Cancelled}

maintenance_logs
  id, vehicle_id (FK), description, cost, status ∈ {Open, Closed},
  opened_at, closed_at

fuel_logs
  id, vehicle_id (FK), liters, cost, date

expenses
  id, vehicle_id (FK), type ∈ {toll, other}, amount, date, description
```

Notes:
- `reg_number` gets a `UNIQUE` DB constraint — don't rely on app-layer checks alone.
- Maintenance cost feeds "operational cost" — don't double-count it if you also log it as an `expense`. Pick one source of truth (recommend: maintenance cost lives only on `maintenance_logs`, expenses table is for tolls/misc only).
- Store `region` on vehicle even though it's not in the mandatory field list — the dashboard filter by region requires it.

---

## 3. RBAC Matrix

| Screen / Action | Fleet Manager | Driver | Safety Officer | Financial Analyst |
|---|---|---|---|---|
| Vehicle CRUD | Full | Read | Read | Read |
| Driver CRUD | Full | Read (own profile) | Full | Read |
| Create/Dispatch/Complete/Cancel Trip | Full | Full (own) | Read | Read |
| Maintenance CRUD | Full | — | Read | Read |
| Fuel/Expense entry | Full | Full (own trips) | — | Read |
| Reports & Analytics | Full | — | Safety-related only | Full |
| Dashboard | Full | Limited (own trips) | License/safety KPIs | Cost/ROI KPIs |

Implementation: put `role` in the JWT payload, gate routes with an Express middleware (`requireRole(['fleet_manager','admin'])`), and gate UI elements client-side purely for UX — **never trust the client-side gate alone**, the server must re-check on every mutating endpoint. This is the single most common hackathon security gap and an easy point for judges to dock.

---

## 4. The State Machine (this is what actually gets graded)

Encode this as a single reusable transition function server-side, not scattered `if` statements across route handlers — you will need to reuse the same checks in trip-complete, trip-cancel, and maintenance-close.

**Vehicle status transitions:**
```
Available → On Trip        [trip dispatched]
On Trip → Available         [trip completed OR dispatched trip cancelled]
Available → In Shop         [maintenance opened]
In Shop → Available          [maintenance closed AND vehicle.status != Retired]
any → Retired                [manual, fleet manager only, irreversible in MVP]
```

**Driver status transitions:**
```
Available → On Trip         [trip dispatched]
On Trip → Available          [trip completed OR dispatched trip cancelled]
Available ↔ Off Duty         [manual toggle]
any → Suspended               [safety officer action; blocks trip assignment]
```

**Trip lifecycle:**
```
Draft → Dispatched → Completed
Dispatched → Cancelled
```
Draft trips are never cancelled in the spec — cancellation only applies post-dispatch (re-read rule: "Cancelling a **dispatched** trip restores..."). Decide explicitly whether Draft trips can be deleted/cancelled too; document your assumption in the README so judges see you caught the ambiguity.

**Validation gate at dispatch time (all must pass, return 4xx with the specific reason if not):**
1. `vehicle.status == 'Available'` (excludes Retired, In Shop, On Trip)
2. `driver.status == 'Available'`
3. `driver.license_expiry_date >= today`
4. `driver.status != 'Suspended'`
5. `trip.cargo_weight <= vehicle.max_load_capacity`

Do these checks **inside a DB transaction** (or at minimum re-fetch and re-check immediately before the write) to avoid a race where two trips grab the same vehicle. In an 8-hour hackathon a simple `SELECT ... FOR UPDATE`-style guard or even an app-level mutex per vehicle_id is enough — you don't need to over-engineer this, just don't leave it completely open, because "double-booking a vehicle" is exactly the bug this platform exists to prevent, and a judge testing two rapid dispatches will find it if it's there.

**Maintenance:**
- Opening a maintenance record sets vehicle → In Shop and **must remove it from the trip-creation vehicle dropdown** (query filter: `WHERE status = 'Available'`, not a client-side hide).
- Closing it sets vehicle → Available *unless* vehicle was separately marked Retired (Retired should outrank In Shop — check vehicle.status before restoring).

---

## 5. API Surface

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/vehicles              (filters: status, type, region)
POST   /api/vehicles              [fleet_manager]
PATCH  /api/vehicles/:id          [fleet_manager]
GET    /api/vehicles/available    (used by trip-creation dropdown)

GET    /api/drivers               (filters: status)
POST   /api/drivers               [fleet_manager, safety_officer]
PATCH  /api/drivers/:id
GET    /api/drivers/available     (status=Available AND license not expired AND not suspended)

POST   /api/trips                 (create Draft)
POST   /api/trips/:id/dispatch    (runs full validation gate)
POST   /api/trips/:id/complete    (body: final_odometer, fuel_consumed)
POST   /api/trips/:id/cancel
GET    /api/trips                 (filters: status, driver, vehicle)

POST   /api/maintenance           [fleet_manager]  → sets vehicle In Shop
POST   /api/maintenance/:id/close [fleet_manager]  → restores vehicle

POST   /api/fuel-logs
POST   /api/expenses

GET    /api/dashboard/kpis        (filters: vehicle_type, status, region)
GET    /api/reports/fuel-efficiency
GET    /api/reports/utilization
GET    /api/reports/operational-cost
GET    /api/reports/roi
GET    /api/reports/export.csv?type=<report>
```

Return specific error codes/messages on validation failure (`409 CARGO_EXCEEDS_CAPACITY`, `409 DRIVER_LICENSE_EXPIRED`, `409 VEHICLE_NOT_AVAILABLE`) — this makes the state machine's correctness visually obvious during a live demo, which is worth more than a generic "400 Bad Request."

---

## 6. KPI & Report Formulas

```
Fleet Utilization %  = (Vehicles On Trip / Total Active Vehicles) × 100
                        [Active = not Retired]

Fuel Efficiency       = Total Distance Traveled / Total Fuel Consumed   (per vehicle, per fleet)

Operational Cost      = Σ Fuel Cost + Σ Maintenance Cost                (per vehicle)

Vehicle ROI            = (Revenue − (Maintenance Cost + Fuel Cost)) / Acquisition Cost
                        [Revenue isn't in the mandatory entity list — add a
                         revenue_per_trip or per-km rate field, or a manual
                         "trip revenue" input at completion time. Flag this
                         gap explicitly to judges rather than silently
                         inventing a number — it shows you read the spec
                         critically instead of pattern-matching a formula.]

Dashboard KPIs         Active Vehicles      = status != Retired
                        Available Vehicles  = status == Available
                        In Maintenance      = status == In Shop
                        Active Trips        = status == Dispatched
                        Pending Trips       = status == Draft
                        Drivers On Duty     = driver.status == On Trip
```

---

## 7. Frontend Screen List (mapped to functional requirements)

1. **Login** (3.1) — email/password, redirect by role.
2. **Dashboard** (3.2) — KPI cards + filter bar (vehicle type, status, region) + 2-3 charts (utilization trend, cost breakdown) for bonus points.
3. **Vehicle Registry** (3.3) — table with search/sort/filter (bonus), add/edit modal, status badge color-coded.
4. **Driver Management** (3.4) — table + profile modal, license-expiry highlighted in red/amber if <30 days (sets up the "email reminder" bonus naturally).
5. **Trip Management** (3.5) — Kanban-style (Draft/Dispatched/Completed/Cancelled columns) or table with action buttons; creation form only shows `/api/vehicles/available` and `/api/drivers/available`.
6. **Maintenance** (3.6) — list + "Open new maintenance" form, close button.
7. **Fuel & Expenses** (3.7) — per-vehicle log entry + running total.
8. **Reports** (3.8) — tables/charts per formula above + CSV export buttons.

Build the Trip Management screen first after auth — it's the one that exercises every business rule and is what a judge will click through first.

---

## 8. Bonus Feature ROI (do these in this order if time remains)

1. **Charts** — cheap with Chart.js, high visual payoff, ~30 min.
2. **Search/filter/sort** — you're already querying with filters for KPIs; extend the same query params to tables, ~30 min.
3. **CSV export** — trivial (join rows, `Content-Type: text/csv`), ~20 min.
4. **Vehicle document management** — file upload + static serve, ~45 min, medium payoff.
5. **Email reminders for expiring licenses** — needs an SMTP/cron setup; **skip unless you have >1 hr left**, it's real integration work for one bullet point.
6. **Dark mode** — CSS variables toggle, do last, ~15 min, cosmetic only.

Do not start bonus features until every item in Section 7 of the original brief (mandatory deliverables) works against the exact Van-05/Alex workflow.

---

## 9. What Teams Usually Get Wrong (and lose points on)

- **Client-side-only validation.** Cargo-weight and license checks done only in the React form, not re-verified server-side — trivially broken with a raw `curl`/Postman call, and judges do test this.
- **Retired vehicles leaking back into dispatch.** Closing a maintenance record blindly sets status to Available without checking if the vehicle was Retired first.
- **No transactional integrity on dispatch.** Two trips assigned to the same vehicle in a race condition.
- **Confusing "Draft" with "unsaved."** Draft is a real, persisted trip state — it must be listed, editable, and dispatchable, not just a client-side form state.
- **ROI computed with a fabricated revenue number** and no visible acknowledgment that revenue isn't a defined entity in the spec — silently making up data reads worse to a judge than flagging the ambiguity and stating your assumption.
- **RBAC that's cosmetic** — hiding buttons but not protecting routes.

---

## 10. Suggested Repo Structure

```
/server
  server.js
  db.js                 (schema + connection)
  middleware/auth.js     (JWT verify + requireRole)
  routes/{auth,vehicles,drivers,trips,maintenance,fuel,expenses,dashboard,reports}.js
  services/stateMachine.js   (single source of truth for status transitions)
/client
  src/
    pages/{Login,Dashboard,Vehicles,Drivers,Trips,Maintenance,FuelExpenses,Reports}.jsx
    components/
    api/client.js
    context/AuthContext.jsx
README.md   (setup steps, assumptions made, demo script)
```

---

## 11. Demo Script (rehearse this exact sequence)

Register Van-05 (500kg) → register driver Alex → create trip, 450kg → dispatch (show both statuses flip to On Trip) → complete trip (enter odometer + fuel) → both flip back to Available → open maintenance on Van-05 → confirm it disappears from a new trip's vehicle dropdown → close maintenance → confirm it reappears → show Reports tab reflecting the fuel log and cost. Then break it on purpose once: try to dispatch a Suspended driver or overweight cargo and show the rejection. That's the whole grading rubric in under three minutes.

---

## 12. Immediate Next Move

Assign owners now, in parallel: one person on DB schema + auth (Section 2-3), one on the state-machine API (Section 4-5), one on frontend shell + Trip Management screen (Section 7), one on dashboard/reports (Section 6). Reconvene at the 4-hour mark to integrate and run the demo script end-to-end — that integration checkpoint is where hackathon teams actually lose time, not the initial build.
