#ifndef SERVICIO_OPERACIONES_H
#define SERVICIO_OPERACIONES_H

#include <map>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "model/emergencia.h"
#include "service/GestorDepartamentos.h"
#include "service/GestorRecursos.h"
#include "service/GeneradorDatos.h"

class ErrorOperacion : public std::runtime_error {
public:
    ErrorOperacion(int codigo, const std::string &mensaje)
        : std::runtime_error(mensaje), codigo(codigo) {}

    int getCodigo() const { return codigo; }

private:
    int codigo;
};

class ServicioOperaciones {
private:
    struct Registro {
        Emergencia emergencia;
        std::string reporteId;
        std::string informe;
        std::string justificacion;
        std::string origen;
        std::map<std::string, bool> atenciones;
        std::string unidad;
        bool tieneUbicacion;
    };

    mutable std::mutex mutex;
    GestorDepartamentos gestor;
    GestorRecursos recursos;
    GeneradorDatos generador;
    std::map<std::string, Registro> registros;
    std::string unidadesFile;
    int contador;

    static std::string normalizarDepartamento(const std::string &valor);
    static bool departamentoValido(const std::string &departamento);
    static int leerEntero(const nlohmann::json &datos, const char *clave,
                          const nlohmann::json &alternativa, int defecto);
    static double leerDouble(const nlohmann::json &datos, const char *clave,
                             const nlohmann::json &alternativa, double defecto);
    static std::string leerTexto(const nlohmann::json &datos, const char *clave,
                                 const nlohmann::json &alternativa);
    nlohmann::json aJson(const Registro &registro) const;
    void cargarUnidadesSinBloqueo(const std::string &ruta);
    void guardarUnidadesSinBloqueo() const;

public:
    ServicioOperaciones();

    void cargarUnidades(const std::string &ruta);
    nlohmann::json crearEmergencia(const nlohmann::json &datos);
    nlohmann::json listarEmergencias(const std::string &estado,
                                     const std::string &departamento) const;
    nlohmann::json obtenerEmergencia(const std::string &id) const;
    nlohmann::json atender(const std::string &id, const std::string &departamento,
                           bool atendida);
    nlohmann::json registrarUnidad(const std::string &departamento,
                                   const std::string &id, int x, int y,
                                   double efectividad, double velocidad);
    nlohmann::json listarUnidades() const;
    bool liberarUnidad(const std::string &id);
    void reiniciar();
};

#endif // SERVICIO_OPERACIONES_H
