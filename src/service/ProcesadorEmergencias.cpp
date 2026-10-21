#include "../../include/service/ProcesadorEmergencias.h"

ProcesadorEmergencias::ProcesadorEmergencias(ClienteClasificador &cliente,
                                             GestorDepartamentos &gestor)
    : cliente(cliente), gestor(gestor) {}

void ProcesadorEmergencias::encolarTexto(const std::string &texto) {
    colaEntrada.push({TipoSolicitud::TEXTO, texto});
}

void ProcesadorEmergencias::encolarAudio(const std::string &rutaAudio) {
    colaEntrada.push({TipoSolicitud::AUDIO, rutaAudio});
}

std::size_t ProcesadorEmergencias::pendientes() const { return colaEntrada.size(); }

bool ProcesadorEmergencias::procesarSiguiente(Emergencia &salida, std::string &error) {
    if (colaEntrada.empty()) {
        error = "No hay emergencias pendientes en la cola de entrada.";
        return false;
    }

    const SolicitudEntrante solicitud = colaEntrada.front();
    colaEntrada.pop();

    ResultadoClasificacion resultado;
    if (solicitud.tipo == TipoSolicitud::TEXTO) {
        resultado = cliente.clasificar(solicitud.contenido);
    } else {
        resultado = cliente.procesarAudio(solicitud.contenido);
    }

    if (!resultado.exito) {
        error = resultado.error;
        return false;
    }

    Emergencia emergencia;
    emergencia.setId(generador.generarId());
    emergencia.setTexto(resultado.texto);
    emergencia.setTranscripcion(resultado.transcripcion);
    emergencia.setSeveridad(resultado.severidad);
    emergencia.setSeveridadEtiqueta(resultado.severidadEtiqueta);
    emergencia.setDepartamentoPrincipal(resultado.departamentoPrincipal);
    emergencia.setDepartamentos(resultado.departamentos);
    emergencia.setConfianza(resultado.confianza);
    emergencia.setRequiereRevision(resultado.requiereRevision);
    emergencia.setProveedor(resultado.proveedor);
    emergencia.setModelo(resultado.modelo);
    emergencia.setAdvertencia(resultado.advertencia);

    emergencia.setTelefonoReportante(generador.generarTelefono());
    emergencia.setUbicacion(generador.generarCoordenada());
    emergencia.setFechaHora(GeneradorDatos::fechaHoraActual());

    if (emergencia.getDepartamentos().empty() &&
        !emergencia.getDepartamentoPrincipal().empty()) {
        emergencia.setDepartamentos({emergencia.getDepartamentoPrincipal()});
    }

    registrarEnColas(emergencia);
    salida = emergencia;
    return true;
}

std::vector<Emergencia> ProcesadorEmergencias::procesarTodas(
    std::vector<std::string> &errores) {
    std::vector<Emergencia> procesadas;
    while (!colaEntrada.empty()) {
        Emergencia emergencia;
        std::string error;
        if (procesarSiguiente(emergencia, error)) {
            procesadas.push_back(emergencia);
        } else {
            errores.push_back(error);
        }
    }
    return procesadas;
}

void ProcesadorEmergencias::registrarEnColas(const Emergencia &emergencia) {
    for (const std::string &departamento : emergencia.getDepartamentos()) {
        Usuario usuario(emergencia.getUbicacion(),
                        emergencia.getTelefonoReportante(),
                        emergencia.getSeveridad(),
                        departamento);
        gestor.registrarUsuario(usuario);
    }
}

bool ProcesadorEmergencias::atenderSiguiente(const std::string &departamento,
                                             Usuario &usuario, std::string &error) {
    if (!gestor.hayUsuariosEnEspera(departamento)) {
        error = "No hay emergencias en espera para el departamento '" + departamento + "'.";
        return false;
    }

    usuario = gestor.atenderSiguiente(departamento);
    if (usuario.getTelefono().empty()) {
        error = "No se pudo atender la emergencia del departamento '" + departamento + "'.";
        return false;
    }
    return true;
}

bool ProcesadorEmergencias::hayEnEspera(const std::string &departamento) {
    return gestor.hayUsuariosEnEspera(departamento);
}

const std::vector<std::string> &ProcesadorEmergencias::departamentosConocidos() {
    static const std::vector<std::string> departamentos = {
        "bomberos",
        "policia",
        "ambulancia",
        "defensa_civil",
    };
    return departamentos;
}
