# Terraform Plan + Apply GCP Action (`tf-plan-apply-gcp`)

`tf-plan-gcp` is a GitHub Action that runs `terraform plan` inside a containerized environment. It helps execute Terraform plan operations with structured and collapsible output formatting, ensuring seamless integration with Google Cloud workflows.

---

## Features
- Containerized Execution → Runs inside a prebuilt Docker container with Terraform installed.
- Automatic Directory Handling → Works within your Terraform directory without manual setup.
- Collapsible Terraform Output → Groups resource changes for better readability in GitHub logs.
- Google Cloud Credentials & Secrets Handling → Reads authentication and Terraform secrets securely from GitHub Secrets.
- Flexible Secret Passing → Pass multiple secrets as an object and access them dynamically in Terraform.
- Works on Any GitHub Runner → No dependency issues—run Terraform anywhere.

---

## Usage
### Basic Example
```yaml
- name: Run Terraform Plan
  uses: gusvega-dev/tf-plan-gcp@v1.1.0
  env:
    GOOGLE_APPLICATION_CREDENTIALS: "${{ secrets.GCP_CREDENTIALS }}"
  with:
    workdir: "./terraform"
    secrets: '{"project_id":"${{ secrets.PROJECT_ID }}"}'
```

### What This Does
- Runs `terraform plan` inside the `./terraform` directory.
- Uses Google Cloud credentials from GitHub Secrets.
- Passes Terraform secrets dynamically as an object.
- Displays structured Terraform logs inside GitHub Actions.

---

## Inputs
| Name       | Required | Default | Description |
|------------|----------|---------|-------------|
| `workdir`  | No       | `.`     | Working directory for Terraform execution. |
| `secrets`  | No       | `{}`    | JSON object containing Terraform secrets. |

### Example: Passing Multiple Secrets
```yaml
- name: Run Terraform Plan
  uses: gusvega-dev/tf-plan-gcp@v1.1.0
  env:
    GOOGLE_APPLICATION_CREDENTIALS: "${{ secrets.GCP_CREDENTIALS }}"
  with:
    workdir: "./terraform"
    secrets: '{"project_id":"${{ secrets.PROJECT_ID }}", "api_key":"${{ secrets.API_KEY }}"}'
```

---

## Using Secrets in Terraform
The secrets passed to the action are automatically available in Terraform as environment variables prefixed with `TF_VAR_` - for example :

### Defining Secrets in Terraform (`variables.tf`)
Create a `variables.tf` file to define the secrets:
```hcl
variable "secrets" {
  type = map(string)
}
```

### Accessing Secrets in Terraform (`main.tf`)
The secrets can be accessed in Terraform using:
```hcl
provider "google" {
  project = var.secrets["project_id"]
}

resource "some_resource" "example" {
  api_key = var.secrets["api_key"]
}
```

### Outputting Secrets in Terraform (`outputs.tf`)
You can also output specific secrets for debugging purposes:
```hcl
output "project_id" {
  value = var.secrets["project_id"]
  sensitive = true
}
```

This allows Terraform to use the secrets securely without exposing them in the configuration files.

---

## Outputs
| Name          | Description |
|--------------|-------------|
| `plan_status` | The status of the Terraform Plan execution. |

---

## How the Container Handles Directories
GitHub Actions automatically mounts the repository into `/github/workspace` inside the container. Any files created there persist between different steps in the workflow.

- Inside the container, the Terraform directory is set as:
  ```sh
  /github/workspace/terraform
  ```
- The action automatically switches to this directory, so Terraform commands run in the expected location.

---

## Example: Repository Structure
Below is a recommended structure for using this action within a repository:

```
repo-root/
│── .github/
│   ├── workflows/
│   │   ├── terraform-plan.yml  # GitHub Action Workflow
│── terraform/
│   ├── main.tf                 # Terraform Configuration
│   ├── variables.tf            # Variables File
│   ├── outputs.tf              # Outputs File
│   ├── provider.tf             # Provider Configuration
│── README.md                   # Documentation
```

---

## Full Terraform Workflow Example
This is a complete Terraform CI/CD pipeline using `tf-plan-gcp`:

```yaml
name: Terraform CI

on:
  push:
    branches:
      - main

env:
  GOOGLE_APPLICATION_CREDENTIALS: "${{ secrets.GCP_CREDENTIALS }}"

jobs:
  terraform-plan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Terraform Plan
        uses: gusvega-dev/tf-plan-gcp@v1.1.0
        with:
          workdir: "./terraform"
          secrets: '{"project_id":"${{ secrets.PROJECT_ID }}", "api_key":"${{ secrets.API_KEY }}"}'
```

### What This Does
- Automatically runs Terraform Plan when pushing to `main`.
- Ensures the Terraform directory is set correctly.
- Uses Google Cloud credentials for authentication.
- Passes secrets from GitHub Workflows to be used within Terraform.

---

## Comparison vs. HashiCorp Terraform Action
| Feature                     | `tf-plan-gcp` (This Action) | HashiCorp Action |
|-----------------------------|----------------------|------------------|
| Requires Terraform Install  | No (Containerized) | Yes |
| Native GCP Support          | Yes | No |
| Flexible Secret Handling    | Yes (JSON object) | No |
| Structured Terraform Logs   | Yes | No |
| Works on Any GitHub Runner  | Yes | No (Requires Terraform Installed) |

---

## Troubleshooting
### Terraform Plan Fails
Check the logs for errors:
1. Check for syntax issues in your Terraform files.
2. Verify Google Cloud credentials are correctly set in the GOOGLE_APPLICATION_CREDENTIALS environment variable.

### Workdir Not Found
Make sure:
- The `workdir` input is set to the correct path inside your repository.
- Your Terraform configuration exists in the specified directory.

### Debugging Secrets
If Terraform is failing due to missing secrets:
1. Check if the secret is missing in GitHub Actions.
2. Print secret values before running Terraform:
   ```yaml
   - name: Debug Secrets
     run: echo "Project ID: ${{ secrets.PROJECT_ID }}"
   ```
3. Ensure secrets are passed as a JSON object to the action.

---

## Future Actions
As part of a broader Terraform automation suite, additional actions will be developed, including:

### **Infrastructure Provisioning & Deployment**
- Terraform Lint & Format
- Security Scan
- Cost Estimation
- Apply Execution
- State Backup
- Post-Deployment Tests
- Change Management Logging

### **Drift Detection & Auto-Remediation**
- Drift Detection
- Auto-Remediation
- Compliance Check
- Manual Approval for Remediation

### **CI/CD for Multi-Environment Deployments**
- Validate Changes
- Deploy to Dev
- Integration Tests
- Manual Approval for Staging
- Deploy to Staging
- Security Scan Before Prod
- Deploy to Production

### **Secret Management & Security Enforcement**
- Secrets Detection
- Secrets Rotation
- IAM Policy Review
- Dynamic Secrets Management

Stay tuned for updates as these become available.

--- 

## License
This project is licensed under the MIT License.

---

## Author
Maintained by Gus Vega: [@gusvega](https://github.com/gusvega)

For feature requests and issues, please open a GitHub Issue.

---

### Ready to use?
Use `tf-plan-gcp` in your Terraform pipelines today. Star this repository if you find it useful.

