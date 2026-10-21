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

/*
    #include <iostream>
#include "service/GestorRecursos.h"
#include "service/GestorDepartamentos.h"
#include "model/unidad.h"
#include "model/usuario.h"
#include "model/coordenadas.h"


int main() {
    GestorDepartamentos gestorDepartamentos;
    GestorRecursos gestorRecursos;

    // 1. Registrar unidades.
    gestorRecursos.registrarUnidad("Medicina", "AMB-001", 1.0, 30.0);
    gestorRecursos.registrarUnidad("Medicina", "AMB-002", 1.0, 60.0);

    // 2. Crear usuarios.
    Usuario u1;
    u1.setId("PEPE");
    u1.setDepartamento("Medicina");
    u1.setPrioridad(1);
    u1.setUbicacion(coordenadas(3, 4));

    Usuario u2;
    u2.setId("ANA");
    u2.setDepartamento("Medicina");
    u2.setPrioridad(3);
    u2.setUbicacion(coordenadas(3, 4));

    Usuario u3;
    u3.setId("LUIS");
    u3.setDepartamento("Medicina");
    u3.setPrioridad(5);
    u3.setUbicacion(coordenadas(3, 4));

    // 3. Registrar usuarios en la cola de espera.
    gestorDepartamentos.registrarUsuario(u1);
    gestorDepartamentos.registrarUsuario(u2);
    gestorDepartamentos.registrarUsuario(u3);

    std::cout << "Usuarios registrados.\n";
    std::cout << "Unidades disponibles: "
              << gestorRecursos.unidadesDisponibles("Medicina")
              << "\n\n";

    // 4. Atender a los usuarios mientras haya unidades disponibles.
    while (gestorDepartamentos.hayUsuariosEnEspera("Medicina")
           && gestorRecursos.unidadesDisponibles("Medicina") > 0) {

        Usuario usuario =
            gestorDepartamentos.atenderSiguiente("Medicina");

        std::cout << "Intentando asignar unidad a: "
                  << usuario.getId() << '\n';

        bool asignado = gestorRecursos.asignarUnidad(usuario);

        if (asignado) {
            std::cout << "Unidad asignada correctamente.\n";
        } else {
            std::cout << "No se pudo asignar una unidad.\n";
        }

        std::cout << "Unidades disponibles: "
                  << gestorRecursos.unidadesDisponibles("Medicina")
                  << "\n\n";
    }

    // 5. Comprobar si quedan usuarios esperando.
    if (gestorDepartamentos.hayUsuariosEnEspera("Medicina")) {
        std::cout << "Quedan usuarios esperando.\n";
    }

    // 6. Avanzar el tiempo para finalizar las atenciones activas.
    std::cout << "\nAvanzando 20 minutos...\n";
    gestorRecursos.avanzarTiempo(20.0);

    std::cout << "\nUnidades disponibles tras el avance: "
              << gestorRecursos.unidadesDisponibles("Medicina")
              << '\n';

    // 7. Asignar unidades a los usuarios que siguen esperando.
    while (gestorDepartamentos.hayUsuariosEnEspera("Medicina")
           && gestorRecursos.unidadesDisponibles("Medicina") > 0) {

        Usuario usuario =
            gestorDepartamentos.atenderSiguiente("Medicina");

        std::cout << "Intentando asignar unidad a: "
                  << usuario.getId() << '\n';

        bool asignado = gestorRecursos.asignarUnidad(usuario);

        if (asignado) {
            std::cout << "Unidad asignada correctamente.\n";
        } else {
            std::cout << "No se pudo asignar una unidad.\n";
        }
    }

    // 8. Terminar las atenciones restantes.
    std::cout << "\nAvanzando otros 20 minutos...\n";
    gestorRecursos.avanzarTiempo(20.0);

    std::cout << "\nUnidades disponibles al final: "
              << gestorRecursos.unidadesDisponibles("Medicina")
              << '\n';

    if (gestorDepartamentos.hayUsuariosEnEspera("Medicina")) {
        std::cout << "Todavia quedan usuarios en espera.\n";
    } else {
        std::cout << "No quedan usuarios en espera.\n";
    }

    return 0;
}
*/