# Mac Notes Clone Development Container
FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Install tfenv and Terraform 1.14.3
RUN git clone --depth=1 https://github.com/tfutils/tfenv.git /opt/tfenv \
    && ln -s /opt/tfenv/bin/* /usr/local/bin
RUN tfenv install 1.14.3 && tfenv use 1.14.3

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Set working directory
WORKDIR /workspace
