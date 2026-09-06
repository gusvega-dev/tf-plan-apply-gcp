# Terraform GCP Actions v2

One engine, three interfaces: `tf-plan-gcp`, `tf-apply-gcp` and
`tf-plan-apply-gcp`. Linux GitHub runners with Node 22; exact Terraform 1.12.1
by default, configurable identically for plan/apply. GCP authentication uses
Workload Identity Federation or credentials already configured by the caller.

## Contract

- Default mode is plan. Plan includes fmt, validate and real state-aware planning.
- Apply accepts only the saved binary plan, its manifest and a trusted manifest
  SHA-256 from the producing job. It never generates a fresh plan.
- Repository, commit, environment, project, workspace, backend bucket/prefix,
  Terraform version, configuration and provider lock must match.
- Plans expire after 24 hours. Terraform itself rejects stale state plans.
- No raw Terraform/provider output is logged. The step summary contains counts
  and a digest. The GuxOps JSON preserves resource changes while masking
  Terraform-sensitive values and common secret field names.
- Raw binary plans can contain secrets. They stay local by default. Upload them
  only to a trusted private repository with short artifact retention. Sensitivity
  masks cannot detect arbitrary unmarked secrets; review your variable schemas.
- `approved: true` is an assertion by the calling workflow, not an approval
  service. Put apply behind a protected GitHub environment or a verified GuxOps
  approval. Do not derive the expected digest from an untrusted downloaded file.
- Do not execute Terraform from untrusted PRs with write-capable credentials.
  PR plan credentials must be read-only. Pin action references to full commits.

## Example (inside a trusted job)

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: actions/checkout@v5
  - id: plan
    uses: gusvega-dev/tf-plan-gcp@v2.0.0
    with:
      workdir: infra/terraform
      plan-directory: ${{ runner.temp }}/reviewed-plan
      state-bucket: ${{ vars.GCP_TERRAFORM_STATE_BUCKET }}
      state-prefix: infra
      environment: dev
      project-id: ${{ vars.GCP_PROJECT_ID }}
      workload-identity-provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
      service-account: ${{ vars.GCP_PLAN_SERVICE_ACCOUNT }}
    env:
      TF_VAR_project_id: ${{ vars.GCP_PROJECT_ID }}
  # In production, transfer the bundle by immutable artifact ID to an apply job
  # gated by a protected environment, passing this job's digest through needs.
  - uses: gusvega-dev/tf-apply-gcp@v2.0.0
    with:
      workdir: infra/terraform
      plan-directory: ${{ runner.temp }}/reviewed-plan
      state-bucket: ${{ vars.GCP_TERRAFORM_STATE_BUCKET }}
      state-prefix: infra
      environment: dev
      project-id: ${{ vars.GCP_PROJECT_ID }}
      approved: 'true'
      expected-manifest-sha256: ${{ steps.plan.outputs.manifest-sha256 }}
```

See `action.yml` for all inputs. Outputs: `has-changes`, `plan-sha256`,
`manifest-sha256`, `plan-directory`, `plan-json`, `plan_status`,
`apply_status`, and legacy `plan-apply_status`.

`destroy-plan` creates a reviewed destruction plan. Apply it using the same
apply contract. `validate` initializes the configured backend and validates
without planning. The action does not create workspaces or state buckets.
Existing GuxOps GKE applications intentionally share `infra` state across
Kubernetes namespaces; separate infrastructure stacks need separate prefixes.

## Migration from v1

v1's `apply: true` and JSON `secrets` input fail with migration guidance.
Use `mode: apply` with a saved bundle and `TF_VAR_*` environment variables.
The plan/apply wrappers select their mode. No Docker image, GHCR write, bundled
credentials or npm runtime dependencies are needed in v2. Existing v1 tags are
left unchanged; upgrade consumers explicitly.

## GuxOps

Upload only `steps.plan.outputs.plan-json` as `ai-infra-terraform-plan`
for PR risk analysis. The binary bundle is a separate private deployment
artifact. GuxOps remains responsible for deterministic policy and approval;
the actions execute Terraform. `ai-tool-test` exercises all three interfaces
using `terraform_data`, with no cloud resources. WIF verification performs
only a read of the existing project.

## Development and release

`npm ci && npm test && npm run test:integration` runs unit and real Terraform
tests. Integration tests create only local `terraform_data` state and remove
it. CI runs on PRs and main. Release only a new exact `v2.x.y` tag after CI;
the release workflow tests first, creates a GitHub release and never force-moves
tags or overwrites container images. Consumers pin full commit SHAs.

[Roadmap decisions](docs/roadmap.md) explain which old proposed actions are
capabilities, workflow stages or deferred integrations.
