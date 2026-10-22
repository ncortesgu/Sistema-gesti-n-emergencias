#include "../../include/service/GestorRecursos.h"


// Constructor
GestorRecursos::GestorRecursos() = default;


// Registrar una unidad en un departamento
void GestorRecursos::registrarUnidad(
    std::string departamento,
    std::string id,
    double efectividad,
    double velocidad
) {
    // Crear el departamento si todavía no existe.
    auto& unidades = recursos[departamento];

    // Evitar identificadores duplicados en todo el sistema.
    for (const auto& par : recursos) {
        for (const auto& unidad : par.second) {
            if (unidad.getId() == id) {
                throw std::invalid_argument(
                    "Ya existe una unidad con ese identificador."
                );
            }
        }
    }

    unidades.emplace_back(id, efectividad, velocidad);
}


// Eliminar una unidad si existe y no está asignada
void GestorRecursos::eliminarUnidad(
    const std::string& departamento,
    const std::string& id
) {
    auto itDepartamento = recursos.find(departamento);

    if (itDepartamento == recursos.end()) {
        return;
    }

    auto& unidades = itDepartamento->second;

    auto itUnidad = std::find_if(
        unidades.begin(),
        unidades.end(),
        [&id](const Unidad& unidad) {
            return unidad.getId() == id;
        }
    );

    if (itUnidad == unidades.end()) {
        return;
    }

    if (itUnidad->isAsignada()) {
        std::cout << "No se puede eliminar una unidad asignada.\n";
        return;
    }

    unidades.erase(itUnidad);
}


// Contar las unidades disponibles de un departamento
int GestorRecursos::unidadesDisponibles(
    const std::string& departamento
) const {
    auto itDepartamento = recursos.find(departamento);

    if (itDepartamento == recursos.end()) {
        return 0;
    }

    int cantidad = 0;

    for (const auto& unidad : itDepartamento->second) {
        if (!unidad.isAsignada()) {
            ++cantidad;
        }
    }

    return cantidad;
}


void GestorRecursos::registrarUnidad(
    std::string departamento,
    std::string id,
    double efectividad,
    double velocidad,
    const coordenadas &ubicacion
) {
    registrarUnidad(departamento, id, efectividad, velocidad);
    auto &unidades = recursos[departamento];
    unidades.back().setUbicacion(ubicacion);
}

// Asignar la mejor unidad disponible al usuario
bool GestorRecursos::asignarUnidad(Usuario& usuario) {
    std::string idUnidad;
    return asignarUnidad(usuario, idUnidad);
}

bool GestorRecursos::asignarUnidad(Usuario& usuario, std::string& idUnidad) {
    const std::string departamento = usuario.getDepartamento();

    auto itDepartamento = recursos.find(departamento);

    if (itDepartamento == recursos.end()) {
        return false;
    }

    Unidad* mejorUnidad = nullptr;
    double mejorTiempo = 0.0;

    for (auto& unidad : itDepartamento->second) {
        if (unidad.isAsignada()) {
            continue;
        }

        double tiempo = unidad.calcularTiempoTotalEstimado(usuario);

        if (mejorUnidad == nullptr || tiempo < mejorTiempo) {
            mejorUnidad = &unidad;
            mejorTiempo = tiempo;
        }
    }

    if (mejorUnidad == nullptr) {
        return false;
    }

    // Calcular por separado el tiempo de desplazamiento.
    double distancia =
        mejorUnidad->calcularDistancia(usuario.getUbicacion());

    double tiempoLlegada =
        60.0 * distancia / mejorUnidad->getVelocidad();

    // El tiempo total incluye desplazamiento y resolución.
    double tiempoResolucion = mejorTiempo - tiempoLlegada;

    if (tiempoResolucion < 0.0) {
        tiempoResolucion = 0.0;
    }

    mejorUnidad->setAsignada(true);
    idUnidad = mejorUnidad->getId();

    AtencionActiva atencion{
        usuario.getId(),
        mejorUnidad->getId(),
        tiempoLlegada,
        tiempoResolucion,
        EstadoAtencion::EnCamino
    };

    atencionesActivas.push_back(atencion);

    return true;
}


std::vector<UnidadVista> GestorRecursos::listarUnidades() const {
    std::vector<UnidadVista> lista;
    for (const auto &par : recursos) {
        for (const Unidad &unidad : par.second) {
            const coordenadas ubicacion = unidad.getUbicacion();
            lista.push_back(UnidadVista{
                par.first,
                unidad.getId(),
                ubicacion.getX(),
                ubicacion.getY(),
                unidad.getEfectividad(),
                unidad.getVelocidad(),
                unidad.isAsignada(),
            });
        }
    }
    return lista;
}

// Liberar una unidad por su identificador
bool GestorRecursos::liberarUnidad(std::string& idUnidad) {
    for (auto& par : recursos) {
        for (auto& unidad : par.second) {
            if (unidad.getId() == idUnidad) {
                unidad.setAsignada(false);
                return true;
            }
        }
    }
    return false;
}


// Avanzar el reloj de la simulación
void GestorRecursos::avanzarTiempo(double minutos) {
    if (minutos < 0.0) {
        throw std::invalid_argument(
            "El tiempo de avance no puede ser negativo."
        );
    }

    auto it = atencionesActivas.begin();

    while (it != atencionesActivas.end()) {
        double tiempoRestante = minutos;

        // Si la unidad todavía está en camino...
        if (it->estado == EstadoAtencion::EnCamino) {
            if (tiempoRestante < it->tiempoLlegadaRestante) {
                it->tiempoLlegadaRestante -= tiempoRestante;
                ++it;
                continue;
            }

            // La unidad llega durante este intervalo.
            tiempoRestante -= it->tiempoLlegadaRestante;
            it->tiempoLlegadaRestante = 0.0;
            it->estado = EstadoAtencion::Atendiendo;
        }

        // Descontar el tiempo de atención.
        if (it->estado == EstadoAtencion::Atendiendo) {
            if (tiempoRestante < it->tiempoAtencionRestante) {
                it->tiempoAtencionRestante -= tiempoRestante;
                ++it;
                continue;
            }
            std::cout << "Tiempo de atencion restante: "
                      << it->tiempoAtencionRestante << " minutos.\n";
            std::cout << it->idUnidad << " ha terminado de atender a "
                      << it->idUsuario << ".\n";
            // La atención ha terminado.
            liberarUnidad(it->idUnidad);

            std::cout << "Atencion finalizada para el usuario "
                      << it->idUsuario << ".\n";

            // Eliminar la atención activa de forma segura.
            it = atencionesActivas.erase(it);
        }
    }
}

void GestorRecursos::infoUnidad(
    const std::string& departamento,
    const std::string& idUnidad
) const {
    auto itDepartamento = recursos.find(departamento);

    if (itDepartamento == recursos.end()) {
        std::cout << "Departamento no encontrado.\n";
        return;
    }

    for (const auto& unidad : itDepartamento->second) {
        if (unidad.getId() == idUnidad) {
            unidad.mostrarInformacion();
            return;
        }
    }

    std::cout << "Unidad no encontrada en el departamento especificado.\n";
}