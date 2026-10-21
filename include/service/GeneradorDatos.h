#ifndef GENERADOR_DATOS_H
#define GENERADOR_DATOS_H

#include <random>
#include <string>
#include <vector>

struct Coordenada {
    double latitud;
    double longitud;
};

class GeneradorDatos {
private:
    std::mt19937_64 generador;
    std::vector<std::string> nombres;

    int enteroEntre(int minimo, int maximo);
    double realEntre(double minimo, double maximo);

public:
    GeneradorDatos();

    std::string generarId();
    std::string generarNombre();
    std::string generarCedula();
    std::string generarTelefono();
    Coordenada generarCoordenada();

    static std::string fechaHoraActual();
    static std::string formatearCoordenada(double valor);
};

#endif // GENERADOR_DATOS_H
