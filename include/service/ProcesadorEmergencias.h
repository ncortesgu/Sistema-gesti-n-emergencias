#ifndef PROCESADOR_EMERGENCIAS_H
#define PROCESADOR_EMERGENCIAS_H

#include <cstddef>
#include <queue>
#include <string>
#include <vector>

#include "model/emergencia.h"
#include "model/usuario.h"
#include "service/ClienteClasificador.h"
#include "service/GeneradorDatos.h"
#include "service/GestorDepartamentos.h"

enum class TipoSolicitud { TEXTO, AUDIO };

struct SolicitudEntrante {
    TipoSolicitud tipo;
    std::string contenido;
};

class ProcesadorEmergencias {
private:
    ClienteClasificador &cliente;
    GestorDepartamentos &gestor;
    GeneradorDatos generador;
    std::queue<SolicitudEntrante> colaEntrada;

    void registrarEnColas(const Emergencia &emergencia);

public:
    ProcesadorEmergencias(ClienteClasificador &cliente, GestorDepartamentos &gestor);

    void encolarTexto(const std::string &texto);
    void encolarAudio(const std::string &rutaAudio);
    std::size_t pendientes() const;

    bool procesarSiguiente(Emergencia &salida, std::string &error);
    std::vector<Emergencia> procesarTodas(std::vector<std::string> &errores);

    bool atenderSiguiente(const std::string &departamento, Usuario &usuario,
                          std::string &error);
    bool hayEnEspera(const std::string &departamento);

    static const std::vector<std::string> &departamentosConocidos();
};

#endif // PROCESADOR_EMERGENCIAS_H
