# Key Decisions One-Pager: Paved Road Internal Tools Platform

---

### 1. Context & Problem Framing: Why Devin Cloud over Power Apps?
* **The Core Question**: *"What does the next internal tool cost, and how should it be built?"*
* **Limitations of Low-Code (Power Apps)**:
  * *Canvas Apps* require developers to have a rigid, pre-conceived UI layout before starting, leading to high design friction.
  * *Model-Driven/Data-Generated Apps* swing to the other extreme—they become overly sprawling, inflexible, and difficult to customize to specific operational workflows.
* **The Devin Cloud Choice**: We adopted **Devin Cloud as an AI-driven scaffolding partner**. Product owners describe requirements in natural business language (entities, permissions, SLAs), Devin scaffolds the tool within established conventions, and teams iteratively refine specs via conversational feedback.

---

### 2. Fintech Security & Confidentiality: Non-Negotiable Invariants
In fintech operations, internal tools handle highly confidential records (customer PII, compliance reviews, financial locks). Security cannot rely on developer discipline or ad-hoc view logic:
* **Row-Level Region Scoping**: Cross-region data access is blocked at the database query layer (`@paved/data`). Out-of-region queries resolve to `404 Not Found` rather than `403` to prevent leaking entity existence across jurisdictions.
* **Column-Level PII Masking by Default**: Entities declare explicit `FieldPolicy` schemas (e.g., masking emails/names). Data is pre-sanitized before reaching the API or UI layer.
* **Directory-Derived RBAC (Deny-by-Default)**: Zero local role/user tables to drift. Roles map strictly to enterprise IdP directory groups, eliminating unauthorized privilege escalation.
* **Database-Enforced Immutability**: All sensitive reads and state transitions write to append-only audit tables where `UPDATE` and `DELETE` triggers are strictly rejected at the database level.

---

### 3. Agent Guardrails: Restricting AI Autonomy via CI Policy-as-Code
Because autonomous agents (like Devin) can inadvertently touch out-of-scope files or introduce architectural regressions when scaffolding tools, we instituted rigid **Policy-as-Code guardrails**:
* **AST & Boundary Linter**: CI automatically blocks any PR where an app inside `apps/<tool>/` imports `pg`, writes raw SQL, or attempts direct cookie/JWT handling. All data and session logic must pass through `@paved/data` and `@paved/platform`.
* **Automated Refusal Test Suite (50+ Tests)**: CI asserts refusal cases (401 unauthenticated, 403 unprivileged, 404 out-of-region, and masked PII payloads). If Devin attempts a shortcut, CI fails instantly, forcing the agent back onto the "Paved Road" before human review.
* **Strict Package Isolation**: Generic capabilities are isolated in `packages/*`. Tools are constrained to route handling, input validation, and declarative UI composition.

---

### 4. Tradeoff Matrix

| Architectural Decision | Alternative Considered | Tradeoff & Rationale |
| :--- | :--- | :--- |
| **Devin Cloud + Pro-Code Platform** | Power Apps (Canvas / Model-Driven) | **Tradeoff**: Requires upfront platform engineering vs. eliminating Canvas design gridlock, unbounded data-model sprawl, and per-seat SaaS licensing. |
| **Enforced Security Invariants** | App-Level Ad-hoc Filtering | **Tradeoff**: Less query flexibility in individual apps vs. guaranteed fintech compliance (zero accidental PII leaks or cross-region data exposure). |
| **CI Policy-as-Code for Agents** | Unconstrained Agent Autonomy | **Tradeoff**: Devin cannot introduce bespoke libraries or custom DB drivers vs. eliminating architectural drift and unintended repository modifications. |
| **Directory Group Claims** | In-App Role Administration | **Tradeoff**: Role updates require IdP directory changes or PRs vs. single source of truth and zero orphaned permissions. |

---

### 5. Architectural Validation
By combining a **shared platform kernel**, **declarative natural-language scaffolding (Devin Cloud)**, and **automated CI refusal gates**, the time to deliver a secure, compliant fintech internal tool drops from weeks of redundant compliance plumbing to defining an entity migration, setting a permission string, and composing standard UI views.
