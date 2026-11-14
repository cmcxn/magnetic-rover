# OPTIONAL / NOT EXECUTED here. Build with this POC directory as build context.
# docker build -t rover-physics-poc verification/moonchipmunk-poc
ARG SKYNET_RUNTIME=chenmins/skynet-demo:sha-f1baee5051108fce40588738f4a5960f12edea97@sha256:9cbaa652cb9f37b8f6025a54d76d9fd18315852c70653b038be972ee074b2d8c
FROM ${SKYNET_RUNTIME} AS build
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git curl gcc g++ make autoconf m4 perl patch python3 \
    libssl-dev libc6-dev binutils && rm -rf /var/lib/apt/lists/*
WORKDIR /poc
COPY . ./
RUN ./build.sh && ./prepare-baseline.sh
FROM ${SKYNET_RUNTIME}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=1000:1000 /poc /poc
USER 1000:1000
WORKDIR /poc
ENTRYPOINT []
CMD ["./run.sh", "test"]
