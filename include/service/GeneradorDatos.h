#ifndef GENERADOR_DATOS_H
#define GENERADOR_DATOS_H

#include <random>
#include <string>

#include "model/coordenadas.h"

class GeneradorDatos {
private:
    std::mt19937_64 generador;

    int enteroEntre(int minimo, int maximo);

public:
    GeneradorDatos();

    std::string generarId();
    std::string generarTelefono();
    coordenadas generarCoordenada();

    static std::string fechaHoraActual();
    static std::string formatearCoordenada(const coordenadas &ubicacion);
};

#endif // GENERADOR_DATOS_H
