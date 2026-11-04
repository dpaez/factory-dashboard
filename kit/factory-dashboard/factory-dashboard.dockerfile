# The release tarball is plain JavaScript, so one download serves amd64 and
# arm64. This stage runs on the builder. The final stage copies only those
# files, so a multi-platform build needs no QEMU.
FROM --platform=$BUILDPLATFORM debian:trixie-slim AS download

ARG DASHBOARD_VERSION=0.2.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN curl -fsSLO "https://github.com/dpaez/factory-dashboard/releases/download/v${DASHBOARD_VERSION}/factory-dashboard-${DASHBOARD_VERSION}.tgz" \
    && curl -fsSLO "https://github.com/dpaez/factory-dashboard/releases/download/v${DASHBOARD_VERSION}/factory-dashboard-${DASHBOARD_VERSION}.tgz.sha256" \
    && sha256sum -c "factory-dashboard-${DASHBOARD_VERSION}.tgz.sha256" \
    && mkdir -p /out/opt/factory-dashboard \
    && tar -xzf "factory-dashboard-${DASHBOARD_VERSION}.tgz" -C /out/opt/factory-dashboard

FROM scratch
COPY --from=download /out/ /
COPY --chmod=0755 factory-dashboard /usr/local/bin/factory-dashboard
