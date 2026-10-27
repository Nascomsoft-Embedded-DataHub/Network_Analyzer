# Network Analyser: 1-Week MVP Build

### Accelerated Implementation Roadmap & Scope Definition

**NASCOMSOFT EMBEDDED HUB | DATA DEPARTMENT**

---

## Objective

Transition immediately from product discovery to a compressed 7-day engineering sprint. The goal is to deploy a functional Minimum Viable Product (MVP) of the Network Analyser to a controlled pilot network by Day 7. This timeline requires ruthless prioritization, strict adherence to the locked scope, and immediate technical execution without over-engineering.

The product remains focused on providing authorized Starlink network administrators with actionable visibility into bandwidth consumption, device connections, and network health — without crossing into covert surveillance.

## 1. Strict Scope Lockdown

To survive a one-week build, the engineering team must hold a hard line on deliverables. Any feature not explicitly listed in the "In Scope" column is deferred to Post-Pilot phases.

| In Scope for Week 1 (MVP) | Strictly Out of Scope |
|---|---|
| **INCLUDED** Connected-device discovery and basic IP/MAC mapping | **DEFERRED** AI traffic classification & deep packet inspection |
| **INCLUDED** Per-device upload/download consumption trends | **PROHIBITED** Content inspection, reading messages, or file tracking |
| **INCLUDED** Network health metrics (latency, speed tests, uptime) | **DEFERRED** Automated blocking or bandwidth throttling |
| **INCLUDED** Simple configurable alerts (unknown device, high usage) | **DEFERRED** Multi-site enterprise management & billing integration |

## 2. Privacy & Security Directives

### Mandatory Safeguards for MVP

- **No Payload Inspection:** The analyzer must operate purely on headers and metadata. Never inspect payload contents.
- **Data Minimization:** Store only the telemetry required to render the 7-day consumption dashboards. Drop granular flow data after 24 hours.
- **Notice Requirement:** The pilot UI must include a prominent administrator acknowledgment that the tool is being used on an authorized, owned network.

## 3. The 7-Day Implementation Sprint

The daily cadence shifts from research to rapid build. Each day focuses on a distinct architectural pillar, leading to a functional pilot deployment by Day 7.

### Day 1: Architecture Lock & Foundation

**Activities:** Finalize the deployment option (router integration vs. hybrid). Lock the primary database schema and establish the local development environments and code repositories.

**Expected Outcome:** A documented and locked database schema, provisioned staging cloud environments, and a running local development setup ready for feature branches.

### Day 2: Core Ingestion Engine

**Activities:** Build the backend data ingestion pipelines. Implement connected-device discovery protocols, device naming algorithms, and the initial IP/MAC address mapping logic.

**Expected Outcome:** The backend system successfully discovers simulated or local connected devices and continuously logs their identities into the database without duplication.

### Day 3: Telemetry & Health Tracking

**Activities:** Implement tracking mechanisms for per-device upload and download bandwidth usage. Integrate API endpoints or local listeners to capture basic health metrics like latency, speed test results, and connection uptime.

**Expected Outcome:** Continuous, accurate capture of bandwidth and health metrics stored efficiently in a time-series format for rapid frontend querying.

### Day 4: Admin Dashboards & UI

**Activities:** Develop the frontend network-wide usage dashboard. Build the peak-usage timeline visualization and implement basic role-based access control (RBAC).

**Expected Outcome:** A functional, authenticated web interface where administrators can view live and historical bandwidth consumption charts, alongside an accurate device list.

### Day 5: Alerts & Export Reporting

**Activities:** Configure logic triggers for unknown-device detection and high-usage thresholds. Build the report generation engine to export daily and weekly consumption into manager-friendly CSV/PDF formats.

**Expected Outcome:** Automated UI/email alerts successfully fire upon new device connections, and administrators can instantly download formatted usage reports for review.

### Day 6: Privacy Hardening & QA

**Activities:** Audit the entire codebase against the established privacy principles. Conduct end-to-end testing to verify data accuracy, ensure encrypted traffic remains untouched, and patch any critical bugs.

**Expected Outcome:** A stable, fully tested MVP verified to drop payload data, complete with a visible, mandatory privacy notice implemented for first-time administrators.

### Day 7: Pilot Launch & Monitoring

**Activities:** Deploy the MVP to the designated internal or partner pilot network. Monitor ingestion stability, system memory usage, and provide initial access credentials to pilot users.

**Expected Outcome:** A live, active deployment on the target network with telemetry flowing correctly, causing zero disruption or noticeable latency to the host Starlink connection.

## 4. Pilot Success Criteria

### Day 7+ Evaluation Metrics

To determine if the MVP is successful enough to graduate from the pilot phase, track the following immediate metrics upon launch:

- **Accuracy:** Device identification and data-consumption tracking match physical reality with >90% accuracy.
- **Performance:** Data ingestion does not introduce noticeable latency or bottlenecking to the host Starlink connection.
- **Actionability:** The administrator successfully uses the dashboard to identify the top 3 bandwidth consumers within the first 48 hours.

### Post-Launch Action

On Day 8, convene the Data Lead and Engineering team for a retrospective. Review the real-world data populated in the dashboard and prioritize the Day 8-14 backlog (critical bug fixes vs. minor usability enhancements).
