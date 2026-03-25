# Requirements: TextBud

**Defined:** 2026-03-24
**Core Value:** Cleaners clean the property exactly the way the owner wants it, verified by AI photo comparison, managed entirely through text messaging.

## v1 Requirements

### Property Setup

- [x] **PROP-01**: Owner can set up a property through guided text conversation
- [x] **PROP-02**: Owner can define rooms for a property (room-by-room structure)
- [x] **PROP-03**: Owner can send staging photos per room as reference standard
- [x] **PROP-04**: Owner can build property FAQ/guidebook via Q&A (WiFi, parking, trash, appliances, house rules, emergency contacts)
- [x] **PROP-05**: Owner can set deep clean cycle (every Nth clean)
- [x] **PROP-06**: Owner can create standard clean checklist and deep clean checklist
- [x] **PROP-07**: Owner can manage multiple properties
- [ ] **PROP-08**: AI generates rough floor plan/room layout from cleaner's entry walkthrough video using Claude Vision
- [ ] **PROP-09**: Floor plan available to cleaners and guests as a navigational reference

### Cleaning Workflow

- [x] **CLEAN-01**: Cleaner can check in via text and receive clean type, checklist, and special instructions
- [x] **CLEAN-02**: Clock starts on check-in and stops on completion
- [x] **CLEAN-03**: Cleaner records entry video walkthrough of property on arrival
- [x] **CLEAN-04**: Checklist is delivered sequentially room-by-room as cleaner progresses
- [x] **CLEAN-05**: TextBud requests milestone photos at timed intervals from specific rooms
- [x] **CLEAN-06**: AI compares milestone photos to staging photos using Claude Vision
- [x] **CLEAN-07**: TextBud flags issues to cleaner in real time based on AI comparison
- [x] **CLEAN-08**: Cleaner marks completion, submits any remaining photos

### Reporting

- [x] **REPT-01**: Owner receives completion report (time in/out, duration, all photos side-by-side with staging, AI assessment per room, flagged items, checklist status)
- [x] **REPT-02**: Inventory walkthrough after clean — item-by-item counts via text
- [x] **REPT-03**: Cleaner can photograph supplies and AI registers inventory levels
- [x] **REPT-04**: Low-stock items flagged to owner
- [x] **REPT-05**: Inventory consumption data collected and stored for future ordering system

### Guest Support

- [x] **GUEST-01**: Guest can text TextBud for property info and get instant answers from FAQ
- [x] **GUEST-02**: Unknown questions flagged to owner with option to add answer to knowledge base
- [x] **GUEST-03**: Guest interactions happen in three-way Telegram group (guest + owner/manager + bot)

### Communication

- [x] **COMM-01**: All cleaning interactions happen in three-way Telegram groups (owner + cleaner + bot)
- [x] **COMM-02**: Cleaning groups are persistent per cleaner
- [x] **COMM-03**: Owner can edit checklists, instructions, and property info on the fly via text from any thread
- [x] **COMM-04**: Bot carries property knowledge into any new group automatically

### Payments

- [ ] **PAY-01**: Owner can subscribe to TextBud via Telegram Payments (Stripe backend, Apple Pay / Google Pay)
- [ ] **PAY-02**: Subscription is billed per property per month
- [ ] **PAY-03**: Owner can add/remove properties and billing adjusts automatically
- [ ] **PAY-04**: Owner can view subscription status and cancel via text

## v2 Requirements

### Communication

- **COMM-05**: Owner can actively observe or participate in live cleaning sessions (full three-way thread participation)

### Supply Management

- **SUPP-01**: Backend ordering system powered by inventory consumption data
- **SUPP-02**: Tiered supply ordering recommendations (Amazon, wholesale, etc.)

### Floor Plan

- **PLAN-01**: Owner can describe room connections during setup for more accurate floor plans
- **PLAN-02**: AI-refined floor plans combining owner description + walkthrough video

### Multi-Channel

- **CHAN-01**: WhatsApp support
- **CHAN-02**: Signal support
- **CHAN-03**: iMessage/SMS support

## Out of Scope

| Feature | Reason |
|---------|--------|
| Smart home / door codes / auto-unlock | Not core to cleaning workflow |
| Payment processing beyond subscriptions | Complex billing (invoicing, refunds, etc.) deferred |
| Owner dashboard / web portal | Text-first, no dashboard |
| Mobile app | Telegram is the interface |
| Supply e-commerce / ordering | MVP collects data, ordering is post-MVP |
| Website | Not needed for MVP |
| Architectural-grade floor plans | Requires specialized CV (Matterport-level), not feasible for MVP |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROP-01 | Phase 1 | Complete |
| PROP-02 | Phase 1 | Complete |
| PROP-03 | Phase 1 | Complete |
| PROP-04 | Phase 1 | Complete |
| PROP-05 | Phase 1 | Complete |
| PROP-06 | Phase 1 | Complete |
| PROP-07 | Phase 1 | Complete |
| PROP-08 | Phase 2 | Pending |
| PROP-09 | Phase 2 | Pending |
| CLEAN-01 | Phase 2 | Complete |
| CLEAN-02 | Phase 2 | Complete |
| CLEAN-03 | Phase 2 | Complete |
| CLEAN-04 | Phase 2 | Complete |
| CLEAN-05 | Phase 2 | Complete |
| CLEAN-06 | Phase 2 | Complete |
| CLEAN-07 | Phase 2 | Complete |
| CLEAN-08 | Phase 2 | Complete |
| REPT-01 | Phase 3 | Complete |
| REPT-02 | Phase 3 | Complete |
| REPT-03 | Phase 3 | Complete |
| REPT-04 | Phase 3 | Complete |
| REPT-05 | Phase 3 | Complete |
| GUEST-01 | Phase 4 | Complete |
| GUEST-02 | Phase 4 | Complete |
| GUEST-03 | Phase 4 | Complete |
| COMM-01 | Phase 1 | Complete |
| COMM-02 | Phase 1 | Complete |
| COMM-03 | Phase 1 | Complete |
| COMM-04 | Phase 1 | Complete |
| PAY-01 | Phase 5 | Pending |
| PAY-02 | Phase 5 | Pending |
| PAY-03 | Phase 5 | Pending |
| PAY-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
