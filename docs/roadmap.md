# Terraform Actions scope

The old roadmap describes 19 additional repositories. Do not create all of them.
Maintain one execution engine in this repository and two thin public wrappers.

| Old roadmap item | Decision |
| --- | --- |
| Lint and format; validate changes | Included in plan/validate mode |
| Plan; apply; combined | Three existing interfaces, one engine |
| Security scan; compliance; IAM policy review | GuxOps deterministic policy engine, optional scanner adapters later |
| Cost estimation | Optional Infracost adapter later; never a required paid dependency |
| Drift detection | Scheduled plan using the same engine; report-only first |
| Auto-remediation | Defer; propose a PR, never unattended production apply |
| Change-management logging | GitHub run, plan digest, approval and GuxOps analysis record |
| State backup | Backend versioning and retention policy, not a copy action |
| Post-deploy and integration tests | Application-specific reusable workflow steps |
| Deploy dev/staging/prod | Same actions with environment configuration |
| Manual staging/remediation approval | GitHub environment and GuxOps approval gates |
| Pre-production security scan | Policy gate over the approved plan |
| Secret detection | Repository scanning, independent of Terraform execution |
| Secret rotation/dynamic secrets | Provider/secret-manager integration; defer |

v2 acceptance: plan by default, protected exact-plan apply, context/checksum
verification, sensitive-value redaction, immutable references, real Terraform
lifecycle tests, GuxOps artifact ingestion, and no cloud resources from CI tests.
