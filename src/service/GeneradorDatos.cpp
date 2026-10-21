#include "../../include/service/GeneradorDatos.h"

#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>

GeneradorDatos::GeneradorDatos() : generador(std::random_device{}()) {}

int GeneradorDatos::enteroEntre(int minimo, int maximo) {
    std::uniform_int_distribution<int> distribucion(minimo, maximo);
    return distribucion(generador);
}

std::string GeneradorDatos::generarId() {
    static const char *hexadecimal = "0123456789ABCDEF";
    std::string id;
    id.reserve(8);
    for (int i = 0; i < 8; ++i) {
        id.push_back(hexadecimal[enteroEntre(0, 15)]);
    }
    return id;
}

std::string GeneradorDatos::generarTelefono() {
    std::ostringstream telefono;
    telefono << "+57 3" << enteroEntre(0, 5) << enteroEntre(0, 9) << " ";
    telefono << std::setw(3) << std::setfill('0') << enteroEntre(0, 999) << " ";
    telefono << std::setw(4) << std::setfill('0') << enteroEntre(0, 9999);
    return telefono.str();
}

coordenadas GeneradorDatos::generarCoordenada() {
    // Cuadrícula simulada de 0 a 1000 para ubicar al reportante.
    return coordenadas(enteroEntre(0, 1000), enteroEntre(0, 1000));
}

std::string GeneradorDatos::fechaHoraActual() {
    const auto ahora = std::chrono::system_clock::now();
    const std::time_t tiempo = std::chrono::system_clock::to_time_t(ahora);
    std::tm desglose{};
#ifdef _WIN32
    localtime_s(&desglose, &tiempo);
#else
    localtime_r(&tiempo, &desglose);
#endif
    std::ostringstream salida;
    salida << std::put_time(&desglose, "%Y-%m-%d %H:%M:%S");
    return salida.str();
}

std::string GeneradorDatos::formatearCoordenada(const coordenadas &ubicacion) {
    std::ostringstream salida;
    salida << "(" << ubicacion.getX() << ", " << ubicacion.getY() << ")";
    return salida.str();
}
