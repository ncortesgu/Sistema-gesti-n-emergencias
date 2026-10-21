FROM debian:bookworm-slim AS compilacion

RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake g++ make ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY CMakeLists.txt ./
COPY CMakePresets.json ./
COPY include ./include
COPY src ./src
COPY main.cpp ./

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j"$(nproc)"

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=compilacion /src/build/sistema_emergencias /usr/local/bin/sistema_emergencias

RUN mkdir -p /app/audios

ENV CLASIFICADOR_URL=http://clasificador:8000 \
    DIRECTORIO_AUDIOS=/app/audios

ENTRYPOINT ["sistema_emergencias"]
