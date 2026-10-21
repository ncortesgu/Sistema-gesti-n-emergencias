#ifndef CLIENTE_CLASIFICADOR_H
#define CLIENTE_CLASIFICADOR_H

#include <string>
#include <vector>

struct ResultadoClasificacion {
    bool exito = false;
    std::string error;

    std::string texto;
    std::string transcripcion;
    int severidad = 5;
    std::string severidadEtiqueta = "Informativa";
    std::string departamentoPrincipal;
    std::vector<std::string> departamentos;
    double confianza = 0.0;
    bool requiereRevision = true;
    std::string proveedor;
    std::string modelo;
    std::string advertencia;
    long latenciaMs = 0;
};

class ClienteClasificador {
private:
    std::string baseUrl;
    int timeoutClasificacionSegundos;
    int timeoutAudioSegundos;

public:
    explicit ClienteClasificador(const std::string &urlBase);

    bool salud(std::string &error);
    ResultadoClasificacion clasificar(const std::string &texto,
                                      const std::string &proveedor = "");
    ResultadoClasificacion procesarAudio(const std::string &rutaAudio,
                                         const std::string &proveedor = "");
    bool transcribir(const std::string &rutaAudio, std::string &texto, std::string &error);

    std::string getBaseUrl() const;
};

#endif // CLIENTE_CLASIFICADOR_H
