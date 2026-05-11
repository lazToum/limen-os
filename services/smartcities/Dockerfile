# Smart Cities demo — Babylon.js building energy visualization
# Builds on top of the sinergym image (EnergyPlus + sinergym already installed).
# Sources are baked in at build time via vendor/ dirs — no runtime volume mounts needed.
# Populate vendor dirs first: make vendor LIMEN_CODE_DIR=/path/to/limen/code/limen

# cspell: disable

FROM waldiez/sinergym

# Extra SAF runtime deps (sinergym already in base image venv)
COPY requirements.txt /tmp/smartcities-requirements.txt
RUN /app/venv/bin/pip install --no-cache-dir -r /tmp/smartcities-requirements.txt \
    && rm /tmp/smartcities-requirements.txt

# Vendored sources — populate with: make vendor
# demo/     → Babylon.js frontend HTML (served at GET /)
# saf/      → SAF Python modules (saf package, rbc_hvac_agent, sinergym_env_agent)
COPY vendor/demo/ /app/demo/
# Copy only the saf/ Python package subdirectory (not the project root)
COPY vendor/saf/saf/ /app/saf/

COPY server.py /app/smartcities_server.py

EXPOSE 8091

CMD ["/app/venv/bin/python", "/app/smartcities_server.py"]
