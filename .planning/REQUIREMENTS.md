# Requirements: TextBud

**Defined:** 2026-03-24
**Core Value:** Cleaners clean the property exactly the way the owner wants it, verified by AI photo comparison, managed entirely through text messaging.

## v1 Requirements

### Property Setup

- [ ] **PROP-01**: Owner can set up a property through guided text conversation
- [ ] **PROP-02**: Owner can define rooms for a property (room-by-room structure)
- [ ] **PROP-03**: Owner can send staging photos per room as reference standard
- [ ] **PROP-04**: Owner can build property FAQ/guidebook via Q&A (WiFi, parking, trash, appliances, house rules, emergency contacts)
- [ ] **PROP-05**: Owner can set deep clean cycle (every Nth clean)
- [ ] **PROP-06**: Owner can create standard clean checklist and deep clean checklist
- [ ] **PROP-07**: Owner can manage multiple properties
- [ ] **PROP-08**: AI generates rough floor plan/room layout from cleaner's entry walkthrough video using Claude Vision
- [ ] **PROP-09**: Floor plan available to cleaners and guests as a navigational reference

### Cleaning Workflow

- [ ] **CLEAN-01**: Cleaner can check in via text and receive clean type, checklist, and special instructions
- [ ] **CLEAN-02**: Clock starts on check-in and stops on completion
- [ ] **CLEAN-03**: Cleaner records entry video walkthrough of property on arrival
- [ ] **CLEAN-04**: Checklist is delivered sequentially room-by-room as cleaner progresses
- [ ] **CLEAN-05**: TextBud requests milestone photos at timed intervals from specific rooms
- [ ] **CLEAN-06**: AI compares milestone photos to staging photos using Claude Vision
- [ ] **CLEAN-07**: TextBud flags issues to cleaner in real time based on AI comparison
- [ ] **CLEAN-08**: Cleaner marks completion, submits any remaining photos

### Reporting

- [ ] **REPT-01**: Owner receives completion report (time in/out, duration, all photos side-by-side with staging, AI assessment per room, flagged items, checklist status)
- [ ] **REPT-02**: Inventory walkthrough after clean — item-by-item counts via text
- [ ] **REPT-03**: Cleaner can photograph supplies and AI registers inventory levels
- [ ] **REPT-04**: Low-stock items flagged to owner
- [ ] **REPT-05**: Inventory consumption data collected and stored for future ordering system

### Guest Support

- [ ] **GUEST-01**: Guest can text TextBud for property info and get instant answers from FAQ
- [ ] **GUEST-02**: Unknown questions flagged to owner with option to add answer to knowledge base
- [ ] **GUEST-03**: Guest interactions happen in three-way Telegram group (guest + owner/manager + bot)

### Communication

- [ ] **COMM-01**: All cleaning interactions happen in three-way Telegram groups (owner + cleaner + bot)
- [ ] **COMM-02**: Cleaning groups are persistent per cleaner
- [ ] **COMM-03**: Owner can edit checklists, instructions, and property info on the fly via text from any thread
- [ ] **COMM-04**: Bot carries property knowledge into any new group automatically

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
| Payment processing | Defer to post-MVP |
| Owner dashboard / web portal | Text-first, no dashboard |
| Mobile app | Telegram is the interface |
| Supply e-commerce / ordering | MVP collects data, ordering is post-MVP |
| Website | Not needed for MVP |
| Architectural-grade floor plans | Requires specialized CV (Matterport-level), not feasible for MVP |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROP-01 | Phase 1 | Pending |
| PROP-02 | Phase 1 | Pending |
| PROP-03 | Phase 1 | Pending |
| PROP-04 | Phase 1 | Pending |
| PROP-05 | Phase 1 | Pending |
| PROP-06 | Phase 1 | Pending |
| PROP-07 | Phase 1 | Pending |
| PROP-08 | Phase 2 | Pending |
| PROP-09 | Phase 2 | Pending |
| CLEAN-01 | Phase 2 | Pending |
| CLEAN-02 | Phase 2 | Pending |
| CLEAN-03 | Phase 2 | Pending |
| CLEAN-04 | Phase 2 | Pending |
| CLEAN-05 | Phase 2 | Pending |
| CLEAN-06 | Phase 2 | Pending |
| CLEAN-07 | Phase 2 | Pending |
| CLEAN-08 | Phase 2 | Pending |
| REPT-01 | Phase 3 | Pending |
| REPT-02 | Phase 3 | Pending |
| REPT-03 | Phase 3 | Pending |
| REPT-04 | Phase 3 | Pending |
| REPT-05 | Phase 3 | Pending |
| GUEST-01 | Phase 4 | Pending |
| GUEST-02 | Phase 4 | Pending |
| GUEST-03 | Phase 4 | Pending |
| COMM-01 | Phase 1 | Pending |
| COMM-02 | Phase 1 | Pending |
| COMM-03 | Phase 1 | Pending |
| COMM-04 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
