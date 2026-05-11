# AgentFlow — full Python stack (Limen OS)
#
# Runs two processes:
#   • monitor_server  — WS bridge + SPA dashboard  (AF_WS_PORT,   default 8889)
#   • main (REST)     — full actor system REST API  (AF_REST_PORT, default 8890)
#
# Build context: docker/tools/agentflow/  (synced from ../../../agentflow via make sync-tools)

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install runtime deps
COPY requirements.txt ./
RUN python -m pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything the build hook needs BEFORE pip install:
#   scripts/hooks/build_hook.py  — hatchling custom hook (fails if missing)
#   static/app/index.html        — hook checks this to skip frontend rebuild
COPY scripts/ ./scripts/
COPY static/ ./static/
COPY monitor.html ./monitor.html
COPY agentflow/ ./agentflow/
COPY README.md ./
COPY pyproject.toml ./

# AGENTFLOW_FRONTEND_STALE=999999999 tells the hook the SPA is always fresh
RUN AGENTFLOW_FRONTEND_STALE=999999999 pip install --no-cache-dir -e ".[anthropic,openai]"

EXPOSE 8889 8890

ENV AGENTFLOW_BROKER=host.docker.internal
ENV AF_WS_PORT=8889
ENV AF_REST_PORT=8890
ENV AF_MQTT_PORT=1883
ENV AF_LLM=anthropic

# Entrypoint: starts monitor_server (8889) + full actor REST (8890)
CMD ["sh", "-c", "\
  python -m agentflow.monitor_server \
    --ws-port ${AF_WS_PORT} \
    --broker ${AGENTFLOW_BROKER} \
    --mqtt-port ${AF_MQTT_PORT} & \
  exec python -m agentflow \
    --interface rest \
    --port ${AF_REST_PORT} \
    --mqtt-broker ${AGENTFLOW_BROKER} \
    --mqtt-port ${AF_MQTT_PORT} \
    --llm ${AF_LLM} \
"]
