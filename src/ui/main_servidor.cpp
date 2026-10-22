#include <cstdlib>
#include <iostream>
#include <string>

#include <httplib.h>
#include <nlohmann/json.hpp>

#include "../../include/service/ServicioOperaciones.h"

using json = nlohmann::json;

namespace {

void responder(httplib::Response &res, int estado, const json &cuerpo) {
    res.status = estado;
    res.set_content(cuerpo.dump(), "application/json; charset=utf-8");
}

json leerCuerpo(const httplib::Request &req) {
    if (req.body.empty()) {
        return json::object();
    }
    return json::parse(req.body);
}

std::string variableEntorno(const std::string &nombre, const std::string &defecto) {
    const char *valor = std::getenv(nombre.c_str());
    if (valor == nullptr || std::string(valor).empty()) {
        return defecto;
    }
    return valor;
}

} // namespace

int main() {
    ServicioOperaciones servicio;
    const std::string archivoUnidades =
        variableEntorno("UNIDADES_FILE", "config/unidades.json");
    servicio.cargarUnidades(archivoUnidades);

    int puerto = 9000;
    try {
        puerto = std::stoi(variableEntorno("CPP_API_PORT", "9000"));
    } catch (const std::exception &) {
        puerto = 9000;
    }

    httplib::Server servidor;
    servidor.set_post_routing_handler([](const httplib::Request &, httplib::Response &res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
    });

    servidor.Options(R"(/.*)", [](const httplib::Request &, httplib::Response &res) {
        res.status = 204;
    });

    servidor.Get("/api/salud", [](const httplib::Request &, httplib::Response &res) {
        responder(res, 200, {{"estado", "ok"}, {"servicio", "core-cpp"}});
    });

    servidor.Get("/api/colas", [&servicio](const httplib::Request &, httplib::Response &res) {
        try {
            responder(res, 200, {{"emergencias", servicio.listarEmergencias("", "")}});
        } catch (const std::exception &excepcion) {
            responder(res, 500, {{"detail", excepcion.what()}});
        }
    });

    servidor.Get("/api/emergencias",
                 [&servicio](const httplib::Request &req, httplib::Response &res) {
                     try {
                         responder(res, 200,
                                   {{"emergencias",
                                     servicio.listarEmergencias(
                                         req.get_param_value("estado"),
                                         req.get_param_value("departamento"))}});
                     } catch (const std::exception &excepcion) {
                         responder(res, 500, {{"detail", excepcion.what()}});
                     }
                 });

    servidor.Post("/api/emergencias",
                  [&servicio](const httplib::Request &req, httplib::Response &res) {
                      try {
                          const json datos = leerCuerpo(req);
                          responder(res, 200, servicio.crearEmergencia(datos));
                      } catch (const ErrorOperacion &error) {
                          responder(res, error.getCodigo(), {{"detail", error.what()}});
                      } catch (const json::exception &excepcion) {
                          responder(res, 400,
                                    {{"detail",
                                      std::string("JSON inválido: ") + excepcion.what()}});
                      } catch (const std::exception &excepcion) {
                          responder(res, 500, {{"detail", excepcion.what()}});
                      }
                  });

    servidor.Get(R"(/api/emergencias/([^/]+))",
                 [&servicio](const httplib::Request &req, httplib::Response &res) {
                     try {
                         responder(res, 200,
                                   servicio.obtenerEmergencia(req.matches[1].str()));
                     } catch (const ErrorOperacion &error) {
                         responder(res, error.getCodigo(), {{"detail", error.what()}});
                     } catch (const std::exception &excepcion) {
                         responder(res, 500, {{"detail", excepcion.what()}});
                     }
                 });

    auto atender = [&servicio](const httplib::Request &req, httplib::Response &res) {
        try {
            const json datos = leerCuerpo(req);
            if (!datos.is_object() || !datos.contains("departamento") ||
                !datos["departamento"].is_string()) {
                responder(res, 422, {{"detail", "Falta el departamento."}});
                return;
            }
            const bool atendida = datos.value("atendida", true);
            responder(res, 200,
                      servicio.atender(req.matches[1].str(),
                                       datos["departamento"].get<std::string>(),
                                       atendida));
        } catch (const ErrorOperacion &error) {
            responder(res, error.getCodigo(), {{"detail", error.what()}});
        } catch (const json::exception &excepcion) {
            responder(res, 400,
                      {{"detail", std::string("JSON inválido: ") + excepcion.what()}});
        } catch (const std::exception &excepcion) {
            responder(res, 500, {{"detail", excepcion.what()}});
        }
    };

    servidor.Post(R"(/api/emergencias/([^/]+)/atender)", atender);
    servidor.Patch(R"(/api/emergencias/([^/]+))", atender);

    servidor.Get("/api/unidades",
                 [&servicio](const httplib::Request &, httplib::Response &res) {
                     try {
                         responder(res, 200, {{"unidades", servicio.listarUnidades()}});
                     } catch (const std::exception &excepcion) {
                         responder(res, 500, {{"detail", excepcion.what()}});
                     }
                 });

    servidor.Post("/api/unidades",
                  [&servicio](const httplib::Request &req, httplib::Response &res) {
                      try {
                          const json datos = leerCuerpo(req);
                          if (!datos.is_object()) {
                              responder(res, 422, {{"detail", "Datos de unidad inv?lidos."}});
                              return;
                          }
                          const std::string id = datos.value("id", "");
                          const std::string departamento =
                              datos.value("departamento", "");
                          const int x = datos.value("x", 0);
                          const int y = datos.value("y", 0);
                          const double efectividad = datos.value("efectividad", 1.0);
                          const double velocidad = datos.value("velocidad", 30.0);
                          responder(res, 200,
                                    servicio.registrarUnidad(
                                        departamento, id, x, y, efectividad, velocidad));
                      } catch (const ErrorOperacion &error) {
                          responder(res, error.getCodigo(), {{"detail", error.what()}});
                      } catch (const json::exception &excepcion) {
                          responder(res, 400,
                                    {{"detail",
                                      std::string("JSON inv?lido: ") + excepcion.what()}});
                      } catch (const std::exception &excepcion) {
                          responder(res, 500, {{"detail", excepcion.what()}});
                      }
                  });

    servidor.Post(R"(/api/unidades/([^/]+)/liberar)",
                  [&servicio](const httplib::Request &req, httplib::Response &res) {
                      try {
                          const std::string id = req.matches[1].str();
                          if (!servicio.liberarUnidad(id)) {
                              responder(res, 404, {{"detail", "Unidad no encontrada."}});
                              return;
                          }
                          responder(res, 200,
                                    {{"estado", "liberada"}, {"unidad", id}});
                      } catch (const std::exception &excepcion) {
                          responder(res, 500, {{"detail", excepcion.what()}});
                      }
                  });

    servidor.Post("/api/operaciones/reiniciar",
                  [&servicio](const httplib::Request &, httplib::Response &res) {
                      try {
                          servicio.reiniciar();
                          responder(res, 200, {{"estado", "reiniciado"}});
                      } catch (const std::exception &excepcion) {
                          responder(res, 500, {{"detail", excepcion.what()}});
                      }
                  });

    std::cout << "Core C++ escuchando en 0.0.0.0:" << puerto
              << " (unidades: " << archivoUnidades << ")\n";
    if (!servidor.listen("0.0.0.0", puerto)) {
        std::cerr << "No se pudo iniciar el servidor C++ en el puerto " << puerto << "\n";
        return 1;
    }
    return 0;
}
