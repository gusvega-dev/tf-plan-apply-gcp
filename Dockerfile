# Base image
FROM node:20

# Set metadata labels
LABEL org.opencontainers.image.title="Terraform Plan + Apply GCP Action"
LABEL org.opencontainers.image.description="A GitHub Action that runs Terraform Plan and Apply inside a containerized environment with structured output, Google Cloud authentication, and dynamic secret handling."
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Gus Vega <github.com/gusvega>"

# Set non-interactive mode
ENV DEBIAN_FRONTEND=noninteractive 

# Install Terraform
RUN apt-get update && \
    apt-get install -y wget unzip && \
    wget -q https://releases.hashicorp.com/terraform/1.5.6/terraform_1.5.6_linux_amd64.zip && \
    unzip terraform_1.5.6_linux_amd64.zip && \
    mv terraform /usr/local/bin/terraform && \
    chmod +x /usr/local/bin/terraform && \
    rm -rf /var/lib/apt/lists/* terraform_1.5.6_linux_amd64.zip

# Set working directory to where GitHub mounts the user's repository
WORKDIR /github/workspace

# Copy action files (not user files)
COPY . /app
WORKDIR /app

# Install Node.js dependencies for the action
RUN npm install

# Set entrypoint
ENTRYPOINT ["node", "/app/index.js"]
