# SampleMind: Comprehensive Modular Implementation Plan & API Specification
**AI-Assisted Biological Sample Testing, Lineage & Experiment Management System**

| Document Metadata | Details |
| :--- | :--- |
| **Institution** | RV College of Engineering®, Bengaluru |
| **Department** | Computer Science and Engineering (Data Science) |
| **Course** | Database Management Systems (DBMS) — Lab Part-B Project |
| **Team Members** | Rajath V Shanbhogue (`1RV24CD039`), Siddhanth K Jain (`1RV24CD051`), Vishwas Y K (`1RV24CD061`) |
| **Document Purpose** | Authoritative Module-by-Module Implementation Roadmap & Complete API Catalog |
| **Architectural Style** | Fully Isolated Modularity connected strictly through a central `common` layer |
| **Database Engine** | Dual-Mode: Instant Zero-Setup SQLite (`samplemind.db`) / Production PostgreSQL 16 via `USE_SQLITE` toggle |
| **Design System** | BioTrace Scientific Operations Workspace (Restrained Ink/Navy/Teal palette; No neon colors) |

---

## 1. Architectural Principles & Isolation Contract

### 1.1 Strict Module Isolation Contract
1. **The Common Layer Rule:** All shared entities—including Database Engine, SQLAlchemy Base models, Security/JWT utilities, Constants/Enums, System Exceptions, and Generic Schemas—live strictly in `backend/app/common/`.
2. **Zero Cross-Module Pollution:** Module `A` (e.g., `samples`) **NEVER** imports directly from Module `B` (e.g., `experiments` or `incidents`). If Module `A` requires relational links or shared definitions, it interacts strictly through database foreign keys and the shared ORM models exported by `app.common`.
3. **Internal Module Structure:** Every module is encapsulated within `backend/app/modules/<module_name>/` and contains:
   - `schemas.py`: Module-specific Pydantic request/response schemas.
   - `service.py`: Business logic, transactional boundaries, and database query operations.
   - `router.py`: FastAPI route handlers with strict RBAC dependency injection.
   - `__init__.py`: Clean re-export of the module's router.

```
backend/app/
├── common/                  <-- THE SINGLE SOURCE OF TRUTH (Shared by all modules)
│   ├── config.py            (Environment & USE_SQLITE toggle)
│   ├── constants.py         (Domain Enums: Roles, Statuses, Severities)
│   ├── database.py          (Engine, SessionLocal, Base, PRAGMA hooks)
│   ├── dependencies.py      (RBAC enforcement, Current User, DB session)
│   ├── exceptions.py        (Domain exceptions with HTTP status mapping)
│   ├── models.py            (15 Core SQLAlchemy ORM Table Models)
│   ├── schemas.py           (APIResponse, PaginatedResponse, Auth DTOs)
│   └── security.py          (Argon2/PBKDF2/Bcrypt hashing, JWT encode/decode)
│
├── modules/                 <-- FULLY ISOLATED DOMAIN MODULES
│   ├── auth/                (Authentication & User Management)
│   ├── storage/             (Storage Locations & Laboratory Equipment)
│   ├── samples/             (Sample Registry, Depletion & Derivation)
│   ├── lineage/             (Recursive DAG Graph & Lineage Traversal)
│   ├── tests/               (Sample Quality & Analytical Assays)
│   ├── experiments/         (Multi-sample Protocols & Results)
│   ├── ancient/             (Archaeological Sites & Provenance)
│   ├── incidents/           (Lab Incidents & Blast Radius Tracing)
│   ├── ai_analysis/         (Random Forest Risk Inference & Review)
│   └── analytics/           (Lab Overview Dashboard & Reports)
└── main.py                  (FastAPI Application & Central Router Assembly)
```

### 1.2 Extensibility: Provision for Adding New Modules Later
Adding any future module requires **ZERO modifications** to existing modules. The pluggable workflow:
1. Create a new directory under `backend/app/modules/<new_module>/`.
2. Implement `schemas.py`, `service.py`, and `router.py` (importing only from `app.common`).
3. Register the router in `backend/app/main.py` via `app.include_router(new_module_router)`.
4. Add the frontend route and navigation item in `frontend/src/App.tsx`.

---

## 2. Complete Catalog of All System APIs

The system exposes **42 REST endpoints** grouped into 10 logical domain modules under the `/api/v1` prefix. All endpoints return the standardized `APIResponse[T]` envelope:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2026-10-27T10:00:00Z"
}
```

### Module 1: Authentication & User Administration (`/api/v1/auth`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Public | Authenticates credentials and issues JWT bearer token | `OAuth2PasswordRequestForm` / JSON | `TokenResponse` (token, role, user info) |
| `GET` | `/api/v1/auth/me` | All Authenticated | Returns current authenticated user profile & permissions | None | `UserSummary` |
| `POST` | `/api/v1/auth/register` | Admin | Registers a new researcher or lab personnel | `UserCreateRequest` | `UserSummary` |
| `GET` | `/api/v1/auth/users` | Admin, Lab Manager | Lists all system researchers with role & status filters | Query params: `role`, `is_active` | `List[UserSummary]` |
| `PUT` | `/api/v1/auth/users/{user_id}/status` | Admin | Activates, deactivates, or modifies user system role | `UserStatusUpdateRequest` | `UserSummary` |

---

### Module 2: Storage Infrastructure & Equipment (`/api/v1/storage` & `/api/v1/equipment`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/storage/locations` | All Authenticated | Hierarchical list of labs, freezers, racks, boxes, slots | Query: `parent_id`, `type` | `List[StorageLocationDetail]` |
| `GET` | `/api/v1/storage/locations/{location_id}` | All Authenticated | Detailed view of a storage node + currently stored samples | None | `StorageLocationWithSamples` |
| `POST` | `/api/v1/storage/locations` | Admin, Lab Manager | Creates a new storage unit/slot in the location hierarchy | `StorageLocationCreate` | `StorageLocationDetail` |
| `PUT` | `/api/v1/storage/locations/{location_id}` | Admin, Lab Manager | Updates storage environmental conditions and capacity | `StorageLocationUpdate` | `StorageLocationDetail` |
| `GET` | `/api/v1/storage/occupancy-grid/{parent_id}` | All Authenticated | 2D Slot occupancy matrix for interactive freezer/box view | None | `OccupancyGridResponse` |
| `GET` | `/api/v1/equipment` | All Authenticated | Lists all laboratory instruments with calibration status | Query: `status`, `type` | `List[EquipmentSummary]` |
| `GET` | `/api/v1/equipment/{equipment_id}` | All Authenticated | Equipment details, maintenance logs, and linked experiments | None | `EquipmentDetail` |
| `POST` | `/api/v1/equipment` | Admin, Lab Manager | Registers a new instrument with calibration schedule | `EquipmentCreate` | `EquipmentDetail` |
| `PUT` | `/api/v1/equipment/{equipment_id}/status` | Admin, Lab Manager, Researcher | Updates operational/calibration status of an instrument | `EquipmentStatusUpdate` | `EquipmentDetail` |

---

### Module 3: Sample Registry, Depletion & Derivation (`/api/v1/samples`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/samples` | All Authenticated | Paginated, filtered search across sample catalog | Query: `search`, `type_id`, `status`, `page`, `page_size` | `PaginatedResponse[SampleListItem]` |
| `GET` | `/api/v1/samples/{sample_id}` | All Authenticated | Comprehensive sample profile (provenance, storage, tests, experiments, incidents, risk) | None | `SampleDetailResponse` |
| `POST` | `/api/v1/samples` | Admin, Lab Manager, Researcher | Registers a newly collected specimen with validation | `SampleCreateRequest` | `SampleDetailResponse` |
| `PUT` | `/api/v1/samples/{sample_id}` | Admin, Lab Manager, Researcher | Updates metadata, preservation state, or storage location | `SampleUpdateRequest` | `SampleDetailResponse` |
| `POST` | `/api/v1/samples/{sample_id}/derive` | Admin, Lab Manager, Researcher | **Atomic derivation:** Deducts parent quantity, creates child sample, records lineage edge | `SampleDerivationRequest` | `SampleDerivationResponse` (Child ID + Lineage Edge) |
| `GET` | `/api/v1/samples/{sample_id}/storage-history` | All Authenticated | Audit history of physical location transfers for the sample | None | `List[StorageHistoryItem]` |
| `GET` | `/api/v1/samples/types` | All Authenticated | Catalog of approved sample types (e.g. Bone, Powder, DNA) | None | `List[SampleTypeResponse]` |

---

### Module 4: Recursive Lineage & DAG Graph Explorer (`/api/v1/lineage`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/lineage/{sample_id}` | All Authenticated | Full DAG graph payload (nodes, edges, depths, linked experiments) for graph rendering | Query: `direction` (all/up/down), `max_depth` | `LineageGraphResponse` (Nodes, Edges, Metadata) |
| `GET` | `/api/v1/lineage/{sample_id}/ancestors` | All Authenticated | Recursive CTE upstream traversal to original root specimens | None | `List[LineageNodeItem]` |
| `GET` | `/api/v1/lineage/{sample_id}/descendants` | All Authenticated | Recursive CTE downstream traversal of all derived aliquots | None | `List[LineageNodeItem]` |
| `POST` | `/api/v1/lineage/relationships` | Admin, Lab Manager, Researcher | Records parent-child derivation link with cycle prevention check | `RelationshipCreateRequest` | `RelationshipResponse` |

---

### Module 5: Laboratory Quality & Analytical Testing (`/api/v1/tests`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tests` | All Authenticated | Lists analytical assays with status and outcome filters | Query: `sample_id`, `status`, `outcome` | `PaginatedResponse[TestListItem]` |
| `GET` | `/api/v1/tests/{test_id}` | All Authenticated | Test detail view: protocol, outcome metrics, and observations | None | `TestDetailResponse` |
| `POST` | `/api/v1/tests` | Admin, Lab Manager, Researcher | Schedules or records a new analytical assay on a sample | `TestCreateRequest` | `TestDetailResponse` |
| `PUT` | `/api/v1/tests/{test_id}` | Admin, Lab Manager, Researcher | Updates test execution status, metrics, and conclusion notes | `TestUpdateRequest` | `TestDetailResponse` |

---

### Module 6: Experiments, Cohorts & Results (`/api/v1/experiments` & `/api/v1/results`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/experiments` | All Authenticated | Lists research experiments with status & researcher filters | Query: `status`, `lead_researcher_id` | `PaginatedResponse[ExperimentListItem]` |
| `GET` | `/api/v1/experiments/{experiment_id}` | All Authenticated | Full experiment dossier: linked samples, equipment, results, incidents | None | `ExperimentDetailResponse` |
| `POST` | `/api/v1/experiments` | Admin, Lab Manager, Researcher | Creates a research experiment with linked samples & instruments | `ExperimentCreateRequest` | `ExperimentDetailResponse` |
| `PUT` | `/api/v1/experiments/{experiment_id}` | Admin, Lab Manager, Researcher | Updates experiment protocol, timeline, and status | `ExperimentUpdateRequest` | `ExperimentDetailResponse` |
| `POST` | `/api/v1/experiments/{experiment_id}/samples` | Admin, Lab Manager, Researcher | Attaches additional input samples to an ongoing experiment | `ExperimentSampleAttachRequest` | `APIResponse[bool]` |
| `GET` | `/api/v1/experiments/{experiment_id}/results` | All Authenticated | Lists all scientific results generated by an experiment | None | `List[ResultSummary]` |
| `POST` | `/api/v1/experiments/{experiment_id}/results` | Admin, Lab Manager, Researcher | Records a scientific result linking input sample & measurement | `ResultCreateRequest` | `ResultDetailResponse` |
| `GET` | `/api/v1/results` | All Authenticated | Global registry of experimental results across all protocols | Query: `sample_id`, `experiment_id` | `PaginatedResponse[ResultListItem]` |
| `PUT` | `/api/v1/results/{result_id}/verify` | Admin, Lab Manager | Formally marks an experimental result as scientifically verified | `ResultVerifyRequest` | `ResultDetailResponse` |

---

### Module 7: Ancient Specimens & Archaeological Provenance (`/api/v1/ancient`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ancient/specimens` | All Authenticated | Catalog of archaeological specimens with site, age, and method | Query: `site_id`, `dating_method` | `List[AncientSpecimenListItem]` |
| `GET` | `/api/v1/ancient/specimens/{sample_id}` | All Authenticated | Full archaeological profile (excavation layer, depth, context) | None | `AncientSpecimenDetail` |
| `POST` | `/api/v1/ancient/specimens` | Admin, Lab Manager, Researcher | Creates archaeological specimen profile linked to base sample | `AncientSpecimenCreate` | `AncientSpecimenDetail` |
| `GET` | `/api/v1/ancient/sites` | All Authenticated | Lists excavation sites with geographic coordinates & cultural period | Query: `country`, `period` | `List[SiteSummary]` |
| `POST` | `/api/v1/ancient/sites` | Admin, Lab Manager | Registers a new archaeological excavation site | `SiteCreateRequest` | `SiteDetailResponse` |

---

### Module 8: Laboratory Incidents & Downstream Blast Radius Tracing (`/api/v1/incidents`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/incidents` | All Authenticated | Lists laboratory incidents with severity and status filters | Query: `severity`, `status`, `sample_id` | `PaginatedResponse[IncidentListItem]` |
| `GET` | `/api/v1/incidents/{incident_id}` | All Authenticated | Incident investigation dossier: affected samples & root causes | None | `IncidentDetailResponse` |
| `POST` | `/api/v1/incidents` | Admin, Lab Manager, Researcher | Records an incident (auto-triggers critical sample status propagation) | `IncidentCreateRequest` | `IncidentDetailResponse` |
| `PUT` | `/api/v1/incidents/{incident_id}` | Admin, Lab Manager | Updates incident investigation notes, corrective action & resolution | `IncidentUpdateRequest` | `IncidentDetailResponse` |
| `GET` | `/api/v1/incidents/{incident_id}/downstream-impact` | All Authenticated | **Signature blast radius query:** Traverses lineage to identify all derived child samples, downstream experiments, and affected results | None | `IncidentBlastRadiusResponse` |

---

### Module 9: AI Risk Advisory Subsystem (`/api/v1/ai`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ai/models` | All Authenticated | Active Random Forest model metadata, version, and performance metrics | None | `ModelRegistryInfo` |
| `GET` | `/api/v1/ai/analyses/{sample_id}` | All Authenticated | Historical and latest risk assessments for a biological specimen | None | `List[AIAnalysisResponse]` |
| `POST` | `/api/v1/ai/predict/{sample_id}` | Admin, Lab Manager, Researcher | Runs inference using trained Random Forest, computes class probability and top contributing factors, persists audit record | None | `AIAnalysisResponse` |
| `POST` | `/api/v1/ai/review/{analysis_id}` | Admin, Lab Manager, Researcher | **Human-in-the-loop review:** Researcher confirms or overrides advisory prediction with rationale notes | `AIReviewRequest` | `AIAnalysisResponse` |
| `GET` | `/api/v1/ai/risk-distribution` | All Authenticated | Risk level breakdown across all active samples for analytics | None | `RiskDistributionResponse` |

---

### Module 10: Lab Overview Dashboard, Reports & Analytics (`/api/v1/analytics`)
| Method | Endpoint | Allowed Roles | Description | Request Body | Response Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/analytics/dashboard` | All Authenticated | Core KPI metrics: active samples, active experiments, open incidents, samples needing review, and recent audit activity | None | `DashboardMetricsResponse` |
| `GET` | `/api/v1/analytics/reports/samples-by-type` | All Authenticated | Aggregate breakdown of samples grouped by biological classification | None | `List[SampleTypeDistribution]` |
| `GET` | `/api/v1/analytics/reports/storage-occupancy` | All Authenticated | Storage utilization percentage across freezers and storage units | None | `List[StorageOccupancyItem]` |
| `GET` | `/api/v1/analytics/reports/incident-trends` | All Authenticated | Incident frequency and severity trends over time | Query: `start_date`, `end_date` | `List[IncidentTrendItem]` |

---

## 3. Module-by-Module Step-by-Step Implementation Roadmap

Execution follows a strict **Step-Wise Lifecycle** for each module. We pause and wait for your explicit confirmation before beginning the next step.

```
                      MODULE EXECUTION LIFECYCLE
  ┌─────────────────────────────────────────────────────────────────┐
  │ Step A: Backend Domain Models & Service Layer                   │
  │         (schemas.py, service.py, transactional validation)      │
  └───────────────────────────────┬─────────────────────────────────┘
                                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Step B: Backend API Router & DI Wiring                          │
  │         (router.py, RBAC checks, registration in main.py)       │
  └───────────────────────────────┬─────────────────────────────────┘
                                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Step C: Automated Verification & Testing                        │
  │         (TestClient endpoints, status codes, Swagger probe)     │
  └───────────────────────────────┬─────────────────────────────────┘
                                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Step D: Frontend UI Implementation & API Integration            │
  │         (BioTrace UI/UX specification, typed services, pages)   │
  └─────────────────────────────────────────────────────────────────┘
```

---

### Module 1: Authentication & RBAC (`auth`)
* **Tables:** `AppUser`
* **Dependencies:** Only `backend/app/common/`
* **Phases:**
  * **Step 1A (Backend Schemas & Service):** Implement `modules/auth/schemas.py` and `modules/auth/service.py` with password hashing verification and JWT generation.
  * **Step 1B (Backend Router & Assembly):** Implement `modules/auth/router.py` with `/login`, `/me`, `/register`, `/users` routes; register router in `main.py`.
  * **Step 1C (Verification & Testing):** Execute test script validating login, token decoding, and role permission guards.
  * **Step 1D (Frontend UI):** Build Auth Context, Login page, session persistence, top navigation user menu, and demo role switcher conforming to UI/UX specifications.

---

### Module 2: Storage Infrastructure & Equipment (`storage`)
* **Tables:** `StorageLocation`, `Equipment`, `SampleStorageHistory`
* **Dependencies:** Only `backend/app/common/`
* **Phases:**
  * **Step 2A (Backend Schemas & Service):** Implement `modules/storage/schemas.py` and `service.py` with hierarchical location queries and 2D box occupancy calculation.
  * **Step 2B (Backend Router & Assembly):** Implement `modules/storage/router.py` with location CRUD, 2D occupancy grid endpoint, and equipment status updates; register in `main.py`.
  * **Step 2C (Verification & Testing):** Automated tests for hierarchy building and slot occupancy.
  * **Step 2D (Frontend UI):** Build Storage Locations list view, interactive Box/Slot Occupancy Grid (occupied in teal, available neutral), and Equipment Registry with calibration status badges.

---

### Module 3: Sample Registry, Depletion & Derivation (`samples`) — [COMPLETED 100%]
* **Tables:** `Sample`, `SampleType`, `RestrictedMaterial`, `SampleStorageHistory`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 3A (Backend Schemas & Service):** [DONE] Implemented `modules/samples/schemas.py` and `service.py` with filtered search, parent quantity deduction validation, and atomic sub-sample derivation logic. Tested with `backend/tests/test_samples_service.py` (10/10 PASS).
  * **Step 3B (Backend Router & Assembly):** [DONE] Implemented `modules/samples/router.py` with `/samples`, `/{sample_id}`, `/derive`, `/storage-history`, `/types`; registered in `main.py`.
  * **Step 3C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_samples_endpoints.py` (11/11 PASS) with actual realistic inputs and outputs verifying 401 auth, 201 creation, 409 duplicate rejection, dossier retrieval, physical relocation history, 409 insufficient parent stock rejection, atomic derivation stock deductions, and full depletion transitions.
  * **Step 3D (Frontend UI):** [DONE] Implemented `frontend/src/features/samples/` (`types.ts`, `samplesService.ts`, `SamplesPage.tsx`) with catalog table, filters, register modal, atomic aliquot derivation modal (with real-time parent remaining stock calculator and over-depletion lock), specimen dossier drawer with direct parent/child lineage cards, and physical storage relocation timeline. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 4: Recursive Lineage & DAG Graph Explorer (`lineage`) — [COMPLETED 100%]
* **Tables:** `SampleRelationship`, `Sample`, `SampleType`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 4A (Backend Schemas & Service):** [DONE] Implemented `modules/lineage/schemas.py` and `service.py` with SQL recursive CTEs for upstream ancestry (`get_ancestors`) and downstream descendants (`get_descendants`), relative generation indexing (`0`, `-1`, `+1`), root/leaf detection, DAG graph payload assembly, and cycle prevention logic (`LineageCycleException`). Tested with `backend/tests/test_lineage_service.py` (10/10 PASS).
  * **Step 4B (Backend Router & Assembly):** [DONE] Implemented `modules/lineage/router.py` with `/lineage/{sample_id}`, `/ancestors`, `/descendants`, `/relationships`; exported in `__init__.py` and registered in `main.py`.
  * **Step 4C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_lineage_endpoints.py` (11/11 PASS) with actual realistic inputs and expected outputs verifying 401 unauth, 201 edge creation, 400 self-lineage rejection, 409 direct cycle rejection (B->A), 409 multi-hop cycle rejection (C->A), upstream/downstream recursive CTE queries, and DAG payload generation.
  * **Step 4D (Frontend UI):** [DONE] Implemented `frontend/src/features/lineage/` (`types.ts`, `lineageService.ts`, `LineageExplorerPage.tsx`) featuring an interactive DAG canvas (zoom/pan, generation columns, directed cubic Bézier curves with transformation labels, `240x92px` specimen cards with root/leaf badges, `360px` node inspector drawer, horizontal/vertical layout toggle, and accessible table fallback). Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 5: Laboratory Quality & Analytical Testing (`tests`) — [COMPLETED 100%]
* **Tables:** `SampleTest`, `Sample`, `AppUser`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 5A (Backend Schemas & Service):** [DONE] Implemented `modules/tests/schemas.py` and `service.py` with assay scheduling, quantitative result value and unit ingestion, status validation (`requested`, `in_progress`, `completed`, `cancelled`), and QC interpretation tagging (`PASS`, `OPTIMAL`, `BORDERLINE`, `FAIL`, `CONTAMINATED`). Tested with `backend/tests/test_tests_service.py` (10/10 PASS).
  * **Step 5B (Backend Router & Assembly):** [DONE] Implemented `modules/tests/router.py` with `/tests`, `/{test_id}`; exported in `__init__.py` and registered in `main.py`.
  * **Step 5C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_tests_endpoints.py` (11/11 PASS) with actual realistic inputs and outputs verifying 401 unauth, 201 assay scheduling, 400 invalid status, 404 missing specimen, paginated listings, detail dossiers, status transitions, metric outcome updates, and multi-facet filtering (status, outcome, keyword).
  * **Step 5D (Frontend UI):** [DONE] Implemented `frontend/src/features/tests/` (`types.ts`, `testsService.ts`, `TestsPage.tsx`) with analytical assay catalog, protocol preset buttons (Qubit, qPCR, Bioanalyzer, TapeStation, AMS), outcome update modal, and assay dossier modal with prominent quantitative metric banners. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 6: Experiments, Cohorts & Results (`experiments`) — [COMPLETED 100%]
* **Tables:** `Experiment`, `ExperimentSample`, `ExperimentEquipment`, `ExperimentResult`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 6A (Backend Schemas & Service):** [DONE] Implemented `modules/experiments/schemas.py` and `service.py` with multi-specimen cohort assembly, role tracking (`input`, `control`, `target`, `blank`), instrument reservations (`ExperimentEquipment`), quantitative result logging with observation and interpretations, and verification locks. Tested with `backend/tests/test_experiments_service.py` (10/10 PASS).
  * **Step 6B (Backend Router & Assembly):** [DONE] Implemented `modules/experiments/router.py` with `/experiments`, `/{id}`, `/{id}/samples`, `/{id}/results`, `/results`, `/results/{id}/verify`; exported in `__init__.py` and registered in `main.py`.
  * **Step 6C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_experiments_endpoints.py` (12/12 PASS) with actual realistic inputs and outputs verifying 401 unauth, 201 experiment creation, 409 duplicate codes, cohort specimen attachment, 201 result recording, 409 duplicate result code, result retrieval, peer verification locking (`is_final=True`), and filtered queries.
  * **Step 6D (Frontend UI):** [DONE] Implemented `frontend/src/features/experiments/` (`types.ts`, `experimentsService.ts`, `ExperimentsPage.tsx`) featuring dual-tab navigation (Research Projects & Scientific Results Registry), experiment workspace drawer (cohort specimen list with inline attachment, reserved instruments, result cards with verification locks), new experiment modal with code generator, and global results registry. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 7: Ancient Specimens & Archaeological Provenance (`ancient`) — [COMPLETED 100%]
* **Tables:** `AncientSpecimen`, `ArchaeologicalSite`, `Sample`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 7A (Backend Schemas & Service):** [DONE] Implemented `modules/ancient/schemas.py` and `service.py` for archaeological excavation sites (coordinates, region, country, survey context) and ancient specimen provenance extensions (calibrated BP chronometrics, ± uncertainty, 14C AMS / U-Th dating methods, stratigraphic excavation stratum, taphonomic preservation states, depth cm). Tested with `backend/tests/test_ancient_service.py` (12/12 PASS).
  * **Step 7B (Backend Router & Assembly):** [DONE] Implemented `modules/ancient/router.py` with `/ancient/sites`, `/ancient/sites/{id}`, `/ancient/specimens`, `/ancient/specimens/{sample_id}`; exported in `__init__.py` and registered in `main.py`.
  * **Step 7C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_ancient_endpoints.py` (12/12 PASS) with actual realistic inputs and outputs verifying 401 unauth, 201 excavation site registration, 409 duplicate site codes, 200 site detail retrieval, 201 ancient provenance attachment, 409 duplicate specimen attachment, 404 non-existent sample rejection, 200 dossier retrieval with joined site & sample attributes, 200 chronometrics update, and multi-facet filtering.
  * **Step 7D (Frontend UI):** [DONE] Implemented `frontend/src/features/ancient/` (`types.ts`, `ancientService.ts`, `AncientSpecimensPage.tsx`) featuring documentary-style catalog, Sand accent (`badge-sand`) for calibrated BP chronometrics, excavation stratum badges, provenance inspection drawer, new excavation site modal with code generator, and attach ancient provenance modal. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 8: Laboratory Incidents & Blast Radius Tracing (`incidents`) — [COMPLETED 100%]
* **Tables:** `Incident`, `Sample`, `SampleRelationship`, `Experiment`, `ExperimentSample`, `ExperimentResult`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 8A (Backend Schemas & Service):** [DONE] Implemented `modules/incidents/schemas.py` and `service.py` with multi-tier severity (`low`, `medium`, `high`, `critical`), automated sample quarantine triggers, recursive cascading quarantine propagation, and the signature **downstream blast radius calculation** (BFS recursive traversal of lineage DAG finding all derived child samples, compromised experiments, and tainted results). Tested with `backend/tests/test_incidents_service.py` (8/8 PASS).
  * **Step 8B (Backend Router & Assembly):** [DONE] Implemented `modules/incidents/router.py` with `/incidents`, `/{id}`, and `/{id}/downstream-impact`; exported in `__init__.py` and mounted in `main.py`.
  * **Step 8C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_incidents_endpoints.py` (10/10 PASS) verifying 401 unauth, 201 incident logging, 409 duplicate codes, automated sample quarantine triggers, incident dossier retrieval, CAPA resolution updates, paginated/filtered queries, and end-to-end 2-generation blast radius tracing.
  * **Step 8D (Frontend UI):** [DONE] Implemented `frontend/src/features/incidents/` (`types.ts`, `incidentsService.ts`, `IncidentsPage.tsx`) featuring real-time incident catalog, severity badges (`badge-danger` for critical), CAPA investigation drawer, new incident modal with cascade quarantine toggle, and the signature **Trace Downstream Impact Modal** with 4 hero KPI metric banners, contaminated lineage sample trees, compromised research experiments table, and tainted experimental results register. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 9: AI Risk Advisory Subsystem (`ai_analysis`) — [COMPLETED 100%]
* **Tables:** `AIAnalysis`, `ModelRegistry`, `Sample`, `Incident`, `TestResult`, `SampleRelationship`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 9A (Backend Schemas & Service):** [DONE] Implemented `modules/ai_analysis/schemas.py` and `service.py` with feature extraction from sample records (storage stability, incident count, assay failures, chronological antiquity, quantity depletion, DAG hops), scikit-learn Random Forest model loading/seeding (v2.4.1), class probability inference (LOW, MEDIUM, HIGH), top-3 contributing factor attributions, and human-in-the-loop review persistence with audit log tracking. Tested with `backend/tests/test_ai_analysis_service.py` (9/9 PASS).
  * **Step 9B (Backend Router & Assembly):** [DONE] Implemented `modules/ai_analysis/router.py` with `/ai/models`, `/ai/analyses/{sample_id}`, `/ai/predict/{sample_id}`, `/ai/review/{analysis_id}`, `/ai/risk-distribution`; exported in `__init__.py` and mounted in `main.py`.
  * **Step 9C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_ai_analysis_endpoints.py` (9/9 PASS) verifying 401 unauth, model registry metadata retrieval, deterministic inference calculation, factor attribution weights, review confirmation/override flow, audit logging, and risk distribution metrics.
  * **Step 9D (Frontend UI):** [DONE] Implemented `frontend/src/features/ai/` (`types.ts`, `aiService.ts`, `AIRiskAdvisoryPage.tsx`) featuring mandatory governance disclaimer banner, active model header (v2.4.1, 94.2% accuracy, 0.978 ROC-AUC), global risk distribution segmented bar, interactive specimen inference runner, segmented probability progress bar with confidence badge, top contributing risk attribution cards with weights, human-in-the-loop review confirmation/override modal, collapsible feature snapshot inspector, and evaluation history. Integrated in `App.tsx` and verified with `npm run build` (0 errors).

---

### Module 10: Lab Overview Dashboard, Reports & Analytics (`analytics`) — [COMPLETED 100%]
* **Tables & Views:** `Sample`, `StorageLocation`, `Equipment`, `Incident`, `SampleTest`, `Experiment`, `ExperimentResult`, `AncientSpecimen`, `AIAnalysis`, `AuditLog`, `AppUser`
* **Dependencies:** Only `backend/app/common/`
* **Status:**
  * **Step 10A (Backend Schemas & Service):** [DONE] Implemented `modules/analytics/schemas.py` and `service.py` with multi-dimensional SQL aggregations across biological specimen catalog, cryogenic storage occupancy %, equipment utilization, experiment lifecycle outcomes, quality assay pass/fail rates, safety incident trends, and recent audit activity feed. Tested with `backend/tests/test_analytics_service.py` (6/6 PASS).
  * **Step 10B (Backend Router & Assembly):** [DONE] Implemented `modules/analytics/router.py` with `/api/v1/analytics/dashboard`, `/reports/samples-by-type`, `/reports/storage-occupancy`, `/reports/incident-trends`, `/reports/experiment-outcomes`, `/reports/activity-feed`; exported in `__init__.py` and mounted in `main.py`.
  * **Step 10C (Verification & Testing):** [DONE] Automated test suite `backend/tests/test_analytics_endpoints.py` (10/10 PASS) verifying 401 unauth, dashboard KPI retrieval, biological sample type distribution with proportion share, storage unit capacity metrics, 4-tier incident severity distributions, ISO datetime range filtering, experiment outcomes, audit feed pagination, and researcher role access.
  * **Step 10D (Frontend UI - Reports & Analytics):** [DONE] Implemented `frontend/src/features/analytics/` (`types.ts`, `analyticsService.ts`, `ReportsAnalyticsPage.tsx`) featuring RVCE Academic Attribution & Lab Metadata banner, 6 executive hero KPI metric cards (Samples, Occupancy gauge, Experiments, Assays & QC pass rate, Open incidents & critical alert, AI risk flags), 5 interactive tabbed workspaces (Biological Inventory Breakdown, Storage Infrastructure, Incident Severity Trends, Research Outcomes, and Audit Trail Activity Feed), live metric refresh, and comprehensive JSON report export. Integrated in `App.tsx` and verified with `npm run build` (0 errors).
  * **Step 10E (Overview Tab Command Centre Enhancement):** [DONE]
    - **Backend Schemas & Service:** Added 5 new endpoints under `/api/v1/analytics/`: `/overview-kpis`, `/workflow-pulse`, `/integrity-scan`, `/operational-status`, `/database-insight/{metric_key}`. Implemented 8 relational & data-quality validation rules in `run_integrity_scan` with audit logging, live SQLite/PG engine detection with latency ping in `get_operational_status`, and 6 DBMS educational insight queries in `get_database_insight` with relational algebra breakdowns and count-inflation avoidance explanations.
    - **Automated Verification:** Test suite `backend/tests/test_overview_enhancement.py` (8/8 PASS) validating unauthenticated 401s, exact KPI calculations, 4 workflow pulse stages, 8 integrity checks with audit persistence, live engine telemetry, 6 valid DBMS educational keys, 404 on invalid key, and researcher role access.
    - **Frontend Components & Integration:** Implemented `OverviewDashboard.tsx` master component with `OperationalBanner.tsx` (live engine & latency badge), `QuickActionsBar.tsx` (role-aware shortcuts), `KpiRibbon.tsx` (8 real-time indicators with Locked/Draft result counts), `WorkflowPulse.tsx` (zero-dependency interactive SVG sequential pipeline: Specimens -> Tests -> Cohorts -> Results), `IntegrityObservatory.tsx` (real-time 8-rule relational scan with multidimensional quality health score and clickable findings drawer), `ActivityTimeline.tsx` (audit feed with category filters), `DatabaseInsightModal.tsx` (DBMS query inspector), and preserved module navigation cards. Cleanly wired into `App.tsx` and verified with `npm --prefix frontend run build` (1515 modules transformed, 0 TypeScript errors).

---

## 4. Frontend UI/UX Specification Compliance Matrix

Every module frontend strictly implements the design tokens from the **BioTrace Lab UI/UX Specification**:

| Category | Requirement | Implementation Specification |
| :--- | :--- | :--- |
| **Color Palette** | Restrained Scientific Palette | Ink (`#172B3A`), Navy (`#203B4A`), Teal (`#287D78`), Pale Teal (`#E6F2F0`), Background (`#F5F7F6`), Surface (`#FFFFFF`), Border (`#DCE4E1`), Muted Text (`#687A83`), Sand (`#E9E1D2`), Warning (`#B7791F`), Danger (`#B54747`), Success (`#2F7A55`). **Zero neon/fluorescent colors.** |
| **Typography** | Modern & Technical | **Inter / Manrope** for general UI text; **JetBrains Mono / IBM Plex Mono** for technical IDs (`S001`, `EXP-001`), storage coordinates (`FRZ-01 / RACK-B / BOX-4 / A02`), and timestamps. |
| **Lineage Explorer** | Interactive DAG Graph | React Flow with Dagre layout, min 560px height canvas, custom nodes (`240x88px`), generation badges (`Gen 0`, `Gen 1`), right-hand detail inspector panel (`360px`), accessible table fallback. |
| **State Handling** | 6 Universal States | Every API-backed view implements: Loading Skeleton, Empty State, Validation Error, Server Error, Success Feedback, and Permission Denied. |
| **Scientific Integrity**| Decision Support Framing | AI predictions always include timestamp, model version, probability explanation, contributing factors, and the mandatory disclaimer: *"AI output is decision support generated from structured DBMS records. A qualified researcher must review relevant findings."* |
| **Images & Assets** | Purposeful Photography | High-resolution editorial scientific photography stored locally under `frontend/public/images/` with documented credits in `image-credits.md`. No decorative stock photos behind dense tables or graph nodes. |
