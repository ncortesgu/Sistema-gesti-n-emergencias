cmake_minimum_required(VERSION 3.20)

project(SistemaGestionEmergencias LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

FetchContent_Declare(
    httplib
    URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.18.3.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
set(HTTPLIB_COMPILE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(httplib)

FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/archive/refs/tags/v3.11.3.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(json)

FetchContent_Declare(
    miniaudio
    URL https://github.com/mackron/miniaudio/archive/refs/tags/0.11.22.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(miniaudio)

add_library(emergencias_core STATIC
    src/model/usuario.cpp
    src/model/coordenadas.cpp
    src/model/unidad.cpp
    src/model/emergencia.cpp
    src/service/GestorDepartamentos.cpp
    src/service/GestorRecursos.cpp
    src/service/ClienteClasificador.cpp
    src/service/GeneradorDatos.cpp
    src/service/ProcesadorEmergencias.cpp
    src/service/ServicioOperaciones.cpp
    src/service/GrabadorAudio.cpp
)

target_include_directories(emergencias_core
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${miniaudio_SOURCE_DIR}
)

target_link_libraries(emergencias_core
    PUBLIC
        httplib::httplib
        nlohmann_json::nlohmann_json
)

if(WIN32)
    target_link_libraries(emergencias_core PUBLIC ws2_32 ole32 uuid winmm)
else()
    find_package(Threads REQUIRED)
    target_link_libraries(emergencias_core PUBLIC Threads::Threads ${CMAKE_DL_LIBS} m)
endif()

if(MSVC)
    target_compile_options(emergencias_core PRIVATE /utf-8 /W3)
else()
    target_compile_options(emergencias_core PRIVATE -Wall -Wextra)
endif()

add_executable(demo_colas main.cpp)
target_link_libraries(demo_colas PRIVATE emergencias_core)
target_include_directories(demo_colas PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(sistema_emergencias src/ui/main_emergencias.cpp)
target_link_libraries(sistema_emergencias PRIVATE emergencias_core)

add_executable(servidor_emergencias src/ui/main_servidor.cpp)
target_link_libraries(servidor_emergencias PRIVATE emergencias_core)

if(MSVC)
    target_compile_options(demo_colas PRIVATE /utf-8)
    target_compile_options(sistema_emergencias PRIVATE /utf-8)
endif()
