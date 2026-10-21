#include <iostream>
#include <string>

// Importamos los contratos de nuestras capas
#include "include/model/usuario.h"
#include "include/service/GestorDepartamentos.h"

int main() {
    GestorDepartamentos deptos;

    Usuario u1(coordenadas(120, 340), "3187341934", 5, "bomberos");
    Usuario u2(coordenadas(450, 210), "3187341934", 3, "bomberos");
    Usuario u3(coordenadas(780, 560), "3187341934", 2, "bomberos");
    Usuario u4(coordenadas(310, 900), "3187341934", 2, "bomberos");

    deptos.registrarUsuario(u1);
    deptos.registrarUsuario(u2);
    deptos.registrarUsuario(u3);
    deptos.registrarUsuario(u4);

    if (deptos.hayUsuariosEnEspera("bomberos")) {
        std::cout << "Hay usuarios esperando en la cola de bomberos." << std::endl;
    } else {
        std::cout << "No hay usuarios esperando." << std::endl;
    }

    Usuario ultimo = deptos.atenderSiguiente("bomberos");
    coordenadas ubicacion = ultimo.getUbicacion();
    std::string telefono = ultimo.getTelefono();
    int prio = ultimo.getPrioridad();
    std::string depto = ultimo.getDepartamento();

    std::cout << "El usuario atendido está en las coordenadas ("
              << ubicacion.getX() << ", " << ubicacion.getY() << "), su teléfono es "
              << telefono << ", su prioridad era " << prio
              << " y su departamento era " << depto << std::endl;

    return 0;
}
