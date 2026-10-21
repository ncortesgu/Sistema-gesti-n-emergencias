#include "../../include/service/GeneradorDatos.h"

#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>

GeneradorDatos::GeneradorDatos()
    : generador(std::random_device{}()),
      nombres({"Carlos Pérez", "María Rodríguez", "Juan Gómez", "Ana Martínez",
               "Luis Fernández", "Laura Sánchez", "Andrés Ramírez", "Camila Torres",
               "Jorge Herrera", "Valentina Díaz", "Diego Castillo", "Paula Vargas",
               "Felipe Moreno", "Sofía Jiménez", "Ricardo Ortiz", "Daniela Rojas",
               "Julián Cárdenas", "Natalia Peña", "Óscar Guerrero", "Marcela Silva"}) {}

int GeneradorDatos::enteroEntre(int minimo, int maximo) {
    std::uniform_int_distribution<int> distribucion(minimo, maximo);
    return distribucion(generador);
}

double GeneradorDatos::realEntre(double minimo, double maximo) {
    std::uniform_real_distribution<double> distribucion(minimo, maximo);
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

std::string GeneradorDatos::generarNombre() {
    return nombres[static_cast<std::size_t>(enteroEntre(0, static_cast<int>(nombres.size()) - 1))];
}

std::string GeneradorDatos::generarCedula() {
    const int longitud = enteroEntre(8, 10);
    std::string cedula;
    cedula.reserve(static_cast<std::size_t>(longitud));
    cedula.push_back(static_cast<char>('1' + enteroEntre(0, 8)));
    for (int i = 1; i < longitud; ++i) {
        cedula.push_back(static_cast<char>('0' + enteroEntre(0, 9)));
    }
    return cedula;
}

std::string GeneradorDatos::generarTelefono() {
    std::ostringstream telefono;
    telefono << "+57 3" << enteroEntre(0, 5) << enteroEntre(0, 9) << " ";
    telefono << std::setw(3) << std::setfill('0') << enteroEntre(0, 999) << " ";
    telefono << std::setw(4) << std::setfill('0') << enteroEntre(0, 9999);
    return telefono.str();
}

Coordenada GeneradorDatos::generarCoordenada() {
    // Zona urbana aproximada de Bogotá, Colombia.
    Coordenada coordenada;
    coordenada.latitud = realEntre(4.50, 4.83);
    coordenada.longitud = realEntre(-74.20, -74.00);
    return coordenada;
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

std::string GeneradorDatos::formatearCoordenada(double valor) {
    std::ostringstream salida;
    salida << std::fixed << std::setprecision(6) << valor;
    return salida.str();
}
