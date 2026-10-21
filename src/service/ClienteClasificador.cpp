#include "../../include/service/ClienteClasificador.h"

#include <filesystem>
#include <fstream>
#include <sstream>

#include <httplib.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace {

std::string tipoMime(const std::string &ruta) {
    const std::string extension = std::filesystem::path(ruta).extension().string();
    if (extension == ".wav") return "audio/wav";
    if (extension == ".mp3") return "audio/mpeg";
    if (extension == ".m4a") return "audio/mp4";
    if (extension == ".ogg") return "audio/ogg";
    if (extension == ".flac") return "audio/flac";
    if (extension == ".webm") return "audio/webm";
    if (extension == ".aac") return "audio/aac";
    return "application/octet-stream";
}

std::string detalleDeRespuesta(const std::string &cuerpo) {
    try {
        const json datos = json::parse(cuerpo);
        if (datos.contains("detail")) {
            if (datos["detail"].is_string()) {
                return datos["detail"].get<std::string>();
            }
            return datos["detail"].dump();
        }
    } catch (const std::exception &) {
        // Si no es JSON, se devuelve el cuerpo recortado.
    }
    if (cuerpo.size() > 300) {
        return cuerpo.substr(0, 300);
    }
    return cuerpo;
}

void configurarCliente(httplib::Client &cliente, int lecturaSegundos) {
    cliente.set_connection_timeout(5, 0);
    cliente.set_read_timeout(lecturaSegundos, 0);
    cliente.set_write_timeout(lecturaSegundos, 0);
    cliente.set_follow_location(true);
}

bool convertirRespuesta(const std::string &cuerpo, ResultadoClasificacion &resultado,
                        std::string &error) {
    try {
        const json datos = json::parse(cuerpo);
        if (datos.contains("detail")) {
            error = detalleDeRespuesta(cuerpo);
            return false;
        }

        resultado.texto = datos.value("texto", "");
        if (datos.contains("transcripcion") && !datos["transcripcion"].is_null()) {
            resultado.transcripcion = datos["transcripcion"].get<std::string>();
        }
        resultado.severidad = datos.value("severidad", 5);
        resultado.severidadEtiqueta = datos.value("severidad_etiqueta", "Informativa");
        resultado.departamentoPrincipal = datos.value("departamento_principal", "");
        resultado.confianza = datos.value("confianza", 0.0);
        resultado.requiereRevision = datos.value("requiere_revision", true);
        resultado.proveedor = datos.value("proveedor", "");
        resultado.modelo = datos.value("modelo", "");
        resultado.latenciaMs = datos.value("latencia_ms", 0L);
        if (datos.contains("advertencia") && !datos["advertencia"].is_null()) {
            resultado.advertencia = datos["advertencia"].get<std::string>();
        }
        if (datos.contains("departamentos") && datos["departamentos"].is_array()) {
            for (const auto &departamento : datos["departamentos"]) {
                resultado.departamentos.push_back(departamento.get<std::string>());
            }
        }
        if (resultado.departamentos.empty() && !resultado.departamentoPrincipal.empty()) {
            resultado.departamentos.push_back(resultado.departamentoPrincipal);
        }

        resultado.exito = true;
        return true;
    } catch (const std::exception &excepcion) {
        error = std::string("Respuesta JSON inválida del clasificador: ") + excepcion.what();
        return false;
    }
}

bool leerArchivo(const std::string &ruta, std::string &contenido, std::string &error) {
    std::ifstream archivo(ruta, std::ios::binary);
    if (!archivo) {
        error = "No se pudo abrir el archivo de audio: " + ruta;
        return false;
    }
    std::ostringstream buffer;
    buffer << archivo.rdbuf();
    contenido = buffer.str();
    if (contenido.empty()) {
        error = "El archivo de audio está vacío: " + ruta;
        return false;
    }
    return true;
}

} // namespace

ClienteClasificador::ClienteClasificador(const std::string &urlBase)
    : baseUrl(urlBase), timeoutClasificacionSegundos(90), timeoutAudioSegundos(300) {
    while (!baseUrl.empty() && baseUrl.back() == '/') {
        baseUrl.pop_back();
    }
}

std::string ClienteClasificador::getBaseUrl() const { return baseUrl; }

bool ClienteClasificador::salud(std::string &error) {
    httplib::Client cliente(baseUrl);
    configurarCliente(cliente, 10);
    auto respuesta = cliente.Get("/salud");
    if (!respuesta) {
        error = "No se pudo conectar con el clasificador en " + baseUrl + ": " +
                httplib::to_string(respuesta.error());
        return false;
    }
    if (respuesta->status != 200) {
        error = "El clasificador respondió " + std::to_string(respuesta->status) + ": " +
                detalleDeRespuesta(respuesta->body);
        return false;
    }
    return true;
}

ResultadoClasificacion ClienteClasificador::clasificar(const std::string &texto,
                                                       const std::string &proveedor) {
    ResultadoClasificacion resultado;
    httplib::Client cliente(baseUrl);
    configurarCliente(cliente, timeoutClasificacionSegundos);

    json carga;
    carga["texto"] = texto;
    if (!proveedor.empty()) {
        carga["proveedor"] = proveedor;
    }

    auto respuesta = cliente.Post("/clasificar", carga.dump(), "application/json");
    if (!respuesta) {
        resultado.error = "No se pudo conectar con el clasificador en " + baseUrl + ": " +
                          httplib::to_string(respuesta.error());
        return resultado;
    }
    if (respuesta->status != 200) {
        resultado.error = "El clasificador respondió " + std::to_string(respuesta->status) +
                          ": " + detalleDeRespuesta(respuesta->body);
        return resultado;
    }
    if (!convertirRespuesta(respuesta->body, resultado, resultado.error)) {
        return resultado;
    }
    return resultado;
}

ResultadoClasificacion ClienteClasificador::procesarAudio(const std::string &rutaAudio,
                                                          const std::string &proveedor) {
    ResultadoClasificacion resultado;
    std::string contenido;
    if (!leerArchivo(rutaAudio, contenido, resultado.error)) {
        return resultado;
    }

    httplib::MultipartFormData archivo;
    archivo.name = "archivo";
    archivo.filename = std::filesystem::path(rutaAudio).filename().string();
    archivo.content = contenido;
    archivo.content_type = tipoMime(rutaAudio);

    httplib::MultipartFormDataItems formulario{archivo};
    if (!proveedor.empty()) {
        httplib::MultipartFormData campoProveedor;
        campoProveedor.name = "proveedor";
        campoProveedor.content = proveedor;
        campoProveedor.content_type = "text/plain";
        formulario.push_back(campoProveedor);
    }

    httplib::Client cliente(baseUrl);
    configurarCliente(cliente, timeoutAudioSegundos);
    auto respuesta = cliente.Post("/procesar-audio", formulario);
    if (!respuesta) {
        resultado.error = "No se pudo enviar el audio al clasificador en " + baseUrl + ": " +
                          httplib::to_string(respuesta.error());
        return resultado;
    }
    if (respuesta->status != 200) {
        resultado.error = "El clasificador respondió " + std::to_string(respuesta->status) +
                          ": " + detalleDeRespuesta(respuesta->body);
        return resultado;
    }
    if (!convertirRespuesta(respuesta->body, resultado, resultado.error)) {
        return resultado;
    }
    return resultado;
}

bool ClienteClasificador::transcribir(const std::string &rutaAudio, std::string &texto,
                                      std::string &error) {
    std::string contenido;
    if (!leerArchivo(rutaAudio, contenido, error)) {
        return false;
    }

    httplib::MultipartFormData archivo;
    archivo.name = "archivo";
    archivo.filename = std::filesystem::path(rutaAudio).filename().string();
    archivo.content = contenido;
    archivo.content_type = tipoMime(rutaAudio);

    httplib::Client cliente(baseUrl);
    configurarCliente(cliente, timeoutAudioSegundos);
    auto respuesta = cliente.Post("/transcribir", httplib::MultipartFormDataItems{archivo});
    if (!respuesta) {
        error = "No se pudo enviar el audio al clasificador: " +
                httplib::to_string(respuesta.error());
        return false;
    }
    if (respuesta->status != 200) {
        error = "El clasificador respondió " + std::to_string(respuesta->status) + ": " +
                detalleDeRespuesta(respuesta->body);
        return false;
    }

    try {
        const json datos = json::parse(respuesta->body);
        texto = datos.value("texto", "");
        if (texto.empty()) {
            error = "La transcripción llegó vacía.";
            return false;
        }
        return true;
    } catch (const std::exception &excepcion) {
        error = std::string("Respuesta JSON inválida al transcribir: ") + excepcion.what();
        return false;
    }
}
