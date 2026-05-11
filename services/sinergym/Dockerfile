# Force x86_64 — EnergyPlus only ships Linux x86_64 binaries.
# On Apple Silicon Docker Desktop runs ARM64 by default; this ensures
# the container (and the EnergyPlus binary) both use the same arch.
ARG PLATFORM=linux/amd64
FROM --platform=${PLATFORM} ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# cspell: disable
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv binutils file \
    wget curl git jq ca-certificates \
    # EnergyPlus runtime deps (X11/GL/font — needed even in headless mode)
    libgomp1 \
    libx11-6 libxext6 libxrender1 libxrandr2 libxi6 \
    libxinerama1 libxcursor1 libxtst6 libxss1 libxfixes3 \
    libxdamage1 libxcomposite1 libxcb1 \
    libice6 libsm6 \
    libgl1 libglu1-mesa \
    libfontconfig1 libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Install EnergyPlus 25.2.0 — Ubuntu 24.04 x86_64 build.
ARG EPLUS_VER=25.2.0
ENV EPLUS_PATH=/usr/local/EnergyPlus-25-2-0

RUN ASSET_URL=$(curl -fsSL \
        "https://api.github.com/repos/NREL/EnergyPlus/releases/tags/v${EPLUS_VER}" \
        | jq -r '[.assets[] | select(.name | test("Linux-Ubuntu24.*x86_64\\.sh$"))][0].browser_download_url') \
    && echo "EnergyPlus installer: $ASSET_URL" \
    && wget -q "$ASSET_URL" -O /tmp/eplus.sh \
    && chmod +x /tmp/eplus.sh \
    && printf 'y\n\n' | /tmp/eplus.sh \
    && rm /tmp/eplus.sh

# Diagnostics — show what was installed and whether the .so is loadable
RUN echo "=== installed files ===" \
    && ls -lah ${EPLUS_PATH}/ | grep -E "libenergy|python" \
    && echo "=== file type ===" \
    && file ${EPLUS_PATH}/libenergyplusapi.so.${EPLUS_VER} \
    && echo "=== ldd ===" \
    && ldd ${EPLUS_PATH}/libenergyplusapi.so.${EPLUS_VER} 2>&1 || true

# Make EnergyPlus bundled libs (libpython3.12.so.1.0 etc.) findable at runtime
ENV LD_LIBRARY_PATH=/usr/local/EnergyPlus-25-2-0

WORKDIR /app
RUN python3 -m venv /app/venv
COPY requirements.txt .
RUN /app/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY server.py .

# Vendored sinergym project — populate with: make vendor
# Contains rbc_office.py and supporting files; runs as subprocess inside the container.
COPY vendor/sinergym/ /sinergym/

EXPOSE 8090
CMD ["/app/venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8090"]
