---
phase: 07
slug: vendor-swap
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-16
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| GitHub clone | pi-mono v0.67.2 cloned from `github.com/badlogic/pi-mono --branch v0.67.2` | Public open-source source code |
| npm registry | `partial-json`, `ajv`, `cli-highlight`, `uuid` fetched during `npm install` | Package tarballs — all well-known packages with no known supply-chain concerns at pinned versions |
| /tmp | Intermediate staging area for source and GSD additions backup | Build artifacts only — no secrets or credentials |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|

*No threats identified — all six plans are build infrastructure only (source file replacement and TypeScript compilation). No new network endpoints, auth paths, credential handling, or user input surfaces introduced.*

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | Supply chain (upstream clone) | Source pulled from public git tag `v0.67.2` without cryptographic tag signature verification. Accepted because: (1) badlogic/pi-mono is a trusted upstream; (2) the tag is pinned — not a branch; (3) this is a developer toolchain, not a production service. | gsd-executor (autonomous) | 2026-04-16 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-16 | 0 | 0 | 0 | gsd-security-auditor (automated) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-16
