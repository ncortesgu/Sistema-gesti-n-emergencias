#include "../../include/service/ServicioOperaciones.h"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>

using json = nlohmann::json;

namespace {

const std::vector<std::string> DEPARTAMENTOS = {
    "bomberos",
    "policia",
    "ambulancia",
    "defensa_civil",
};

bool esNumero(const json &valor) {
    return valor.is_number_integer() || valor.is_number_unsigned() ||
           valor.is_number_float();
}

} // namespace

ServicioOperaciones::ServicioOperaciones() : contador(1000) {}

std::string ServicioOperaciones::normalizarDepartamento(const std::string &valor) {
    std::string normalizado;
    for (char caracter : valor) {
        const unsigned char byte = static_cast<unsigned char>(caracter);
        if (std::isalnum(byte)) {
            normalizado.push_back(static_cast<char>(std::tolower(byte)));
        } else if (caracter == ' ' || caracter == '-') {
            normalizado.push_back('_');
        }
    }
    if (normalizado == "bombero" || normalizado == "bomberos") return "bomberos";
    if (normalizado == "policia" || normalizado == "policial") return "policia";
    if (normalizado == "ambulancia" || normalizado == "ambulancias" ||
        normalizado == "medico" || normalizado == "medica") {
        return "ambulancia";
    }
    if (normalizado == "defensa_civil" || normalizado == "defensacivil" ||
        normalizado == "proteccion_civil" || normalizado == "proteccioncivil") {
        return "defensa_civil";
    }
    return "";
}

bool ServicioOperaciones::departamentoValido(const std::string &departamento) {
    return std::find(DEPARTAMENTOS.begin(), DEPARTAMENTOS.end(), departamento) !=
           DEPARTAMENTOS.end();
}

int ServicioOperaciones::leerEntero(const json &datos, const char *clave,
                                    const json &alternativa, int defecto) {
    if (datos.contains(clave) && esNumero(datos[clave])) {
        return datos[clave].get<int>();
    }
    if (alternativa.is_object() && alternativa.contains(clave) &&
        esNumero(alternativa[clave])) {
        return alternativa[clave].get<int>();
    }
    return defecto;
}

double ServicioOperaciones::leerDouble(const json &datos, const char *clave,
                                       const json &alternativa, double defecto) {
    if (datos.contains(clave) && esNumero(datos[clave])) {
        return datos[clave].get<double>();
    }
    if (alternativa.is_object() && alternativa.contains(clave) &&
        esNumero(alternativa[clave])) {
        return alternativa[clave].get<double>();
    }
    return defecto;
}

std::string ServicioOperaciones::leerTexto(const json &datos, const char *clave,
                                           const json &alternativa) {
    if (datos.contains(clave) && datos[clave].is_string()) {
        return datos[clave].get<std::string>();
    }
    if (alternativa.is_object() && alternativa.contains(clave) &&
        alternativa[clave].is_string()) {
        return alternativa[clave].get<std::string>();
    }
    return "";
}

json ServicioOperaciones::aJson(const Registro &registro) const {
    const Emergencia &emergencia = registro.emergencia;
    json item;
    item["id"] = emergencia.getId();
    item["reporte_id"] =
        registro.reporteId.empty() ? emergencia.getId() : registro.reporteId;
    item["texto"] = emergencia.getTexto();
    item["transcripcion"] = emergencia.getTranscripcion().empty()
                                ? json(nullptr)
                                : json(emergencia.getTranscripcion());
    item["informe"] = registro.informe;
    item["justificacion"] = registro.justificacion;
    item["severidad"] = emergencia.getSeveridad();
    item["departamentos"] = emergencia.getDepartamentos();
    if (emergencia.getConfianza() < 0.0) {
        item["confianza"] = nullptr;
    } else {
        item["confianza"] = emergencia.getConfianza();
    }
    item["fecha"] = emergencia.getFechaHora();
    item["origen"] = registro.origen;
    if (registro.tieneUbicacion) {
        item["x"] = emergencia.getUbicacion().getX();
        item["y"] = emergencia.getUbicacion().getY();
    } else {
        item["x"] = nullptr;
        item["y"] = nullptr;
    }

    json atenciones = json::object();
    bool todasAtendidas = true;
    for (const std::string &departamento : emergencia.getDepartamentos()) {
        const auto it = registro.atenciones.find(departamento);
        const bool atendida = it != registro.atenciones.end() && it->second;
        atenciones[departamento] = atendida;
        if (!atendida) {
            todasAtendidas = false;
        }
    }
    item["atenciones"] = atenciones;
    item["unidad"] = registro.unidad.empty() ? json(nullptr) : json(registro.unidad);
    item["estado"] = todasAtendidas ? "atendida" : "pendiente";
    item["proveedor"] = emergencia.getProveedor();
    item["modelo"] = emergencia.getModelo();
    return item;
}

void ServicioOperaciones::cargarUnidadesSinBloqueo(const std::string &ruta) {
    if (ruta.empty()) {
        return;
    }
    unidadesFile = ruta;
    std::ifstream archivo(ruta);
    if (!archivo) {
        std::cerr << "No se encontró el archivo de unidades: " << ruta << "\n";
        return;
    }

    json datos;
    try {
        archivo >> datos;
    } catch (const std::exception &excepcion) {
        std::cerr << "JSON de unidades inválido: " << excepcion.what() << "\n";
        return;
    }

    if (!datos.contains("unidades") || !datos["unidades"].is_array()) {
        return;
    }

    for (const json &item : datos["unidades"]) {
        if (!item.is_object()) continue;
        const std::string departamento =
            normalizarDepartamento(item.value("departamento", ""));
        const std::string id = item.value("id", "");
        if (!departamentoValido(departamento) || id.empty()) continue;

        const int x = item.value("x", 0);
        const int y = item.value("y", 0);
        if (x < 0 || x > 1000 || y < 0 || y > 1000) continue;

        try {
            recursos.registrarUnidad(
                departamento,
                id,
                item.value("efectividad", 1.0),
                item.value("velocidad", 30.0),
                coordenadas(x, y));
        } catch (const std::exception &excepcion) {
            std::cerr << "No se pudo registrar la unidad " << id << ": "
                      << excepcion.what() << "\n";
        }
    }
}

void ServicioOperaciones::cargarUnidades(const std::string &ruta) {
    std::lock_guard<std::mutex> bloqueo(mutex);
    cargarUnidadesSinBloqueo(ruta);
}

void ServicioOperaciones::guardarUnidadesSinBloqueo() const {
    if (unidadesFile.empty()) {
        return;
    }
    json documento;
    documento["unidades"] = json::array();
    for (const UnidadVista &unidad : recursos.listarUnidades()) {
        documento["unidades"].push_back({
            {"id", unidad.id},
            {"departamento", unidad.departamento},
            {"x", unidad.x},
            {"y", unidad.y},
            {"efectividad", unidad.efectividad},
            {"velocidad", unidad.velocidad},
        });
    }
    std::ofstream archivo(unidadesFile);
    if (!archivo) {
        std::cerr << "No se pudo guardar el archivo de unidades: " << unidadesFile
                  << "\n";
        return;
    }
    archivo << documento.dump(2) << "\n";
}

json ServicioOperaciones::crearEmergencia(const json &datos) {
    std::lock_guard<std::mutex> bloqueo(mutex);

    const json clasificacion =
        datos.contains("clasificacion") && datos["clasificacion"].is_object()
            ? datos["clasificacion"]
            : json::object();

    const int severidad = leerEntero(datos, "severidad", clasificacion, 0);
    if (severidad < 1 || severidad > 5) {
        throw ErrorOperacion(422, "La severidad debe estar entre 1 y 5.");
    }

    std::vector<std::string> departamentos;
    auto agregarDepartamento = [&departamentos](const json &valor) {
        if (!valor.is_string()) return;
        const std::string normalizado =
            ServicioOperaciones::normalizarDepartamento(valor.get<std::string>());
        if (ServicioOperaciones::departamentoValido(normalizado) &&
            std::find(departamentos.begin(), departamentos.end(), normalizado) ==
                departamentos.end()) {
            departamentos.push_back(normalizado);
        }
    };

    if (datos.contains("departamentos") && datos["departamentos"].is_array()) {
        for (const json &valor : datos["departamentos"]) agregarDepartamento(valor);
    }
    if (clasificacion.contains("departamentos") &&
        clasificacion["departamentos"].is_array()) {
        for (const json &valor : clasificacion["departamentos"]) agregarDepartamento(valor);
    }
    if (clasificacion.contains("departamento")) {
        agregarDepartamento(clasificacion["departamento"]);
    }

    if (departamentos.empty()) {
        throw ErrorOperacion(422, "La emergencia no tiene departamentos válidos.");
    }

    std::string texto = datos.value("texto", "");
    const std::string transcripcion = datos.value("transcripcion", "");
    if (texto.empty()) texto = transcripcion;
    if (texto.empty()) {
        throw ErrorOperacion(422, "La emergencia no tiene texto ni transcripción.");
    }

    const std::string informe = leerTexto(datos, "informe", clasificacion);
    const std::string justificacion = leerTexto(datos, "justificacion", clasificacion);
    const std::string origen = datos.value("origen", "texto");

    bool tieneUbicacion = false;
    int x = 0;
    int y = 0;
    if (datos.contains("x") && datos.contains("y") && esNumero(datos["x"]) &&
        esNumero(datos["y"])) {
        x = datos["x"].get<int>();
        y = datos["y"].get<int>();
        tieneUbicacion = true;
    } else if (datos.contains("ubicacion") && datos["ubicacion"].is_object() &&
               datos["ubicacion"].contains("x") && datos["ubicacion"].contains("y")) {
        x = datos["ubicacion"]["x"].get<int>();
        y = datos["ubicacion"]["y"].get<int>();
        tieneUbicacion = true;
    }
    if (tieneUbicacion && (x < 0 || x > 1000 || y < 0 || y > 1000)) {
        throw ErrorOperacion(422, "Las coordenadas deben estar entre 0 y 1000.");
    }

    double confianza = leerDouble(datos, "confianza", clasificacion, -1.0);
    if (confianza >= 0.0) {
        confianza = std::max(0.0, std::min(1.0, confianza));
    }

    ++contador;
    const std::string id = "EMG-" + std::to_string(contador);
    const std::string reporteId = datos.value("reporte_id", id);
    const std::string fecha =
        datos.value("fecha", GeneradorDatos::fechaHoraActual());

    Emergencia emergencia;
    emergencia.setId(id);
    emergencia.setTexto(texto);
    emergencia.setTranscripcion(transcripcion);
    emergencia.setSeveridad(severidad);
    emergencia.setSeveridadEtiqueta(
        severidad == 1 ? "Crítica"
                       : severidad == 2 ? "Alta"
                                         : severidad == 3 ? "Media"
                                                          : severidad == 4 ? "Baja"
                                                                           : "Informativa");
    emergencia.setDepartamentoPrincipal(departamentos.front());
    emergencia.setDepartamentos(departamentos);
    emergencia.setConfianza(confianza);
    emergencia.setRequiereRevision(confianza >= 0.0 && confianza < 0.55);
    emergencia.setProveedor(datos.value("proveedor", "panel"));
    emergencia.setModelo(datos.value("modelo", ""));
    emergencia.setAdvertencia(informe);
    emergencia.setTelefonoReportante(generador.generarTelefono());
    emergencia.setFechaHora(fecha);
    if (tieneUbicacion) {
        emergencia.setUbicacion(coordenadas(x, y));
    }

    for (const std::string &departamento : departamentos) {
        Usuario usuario(emergencia.getUbicacion(),
                        emergencia.getTelefonoReportante(),
                        severidad,
                        departamento);
        usuario.setId(id);
        gestor.registrarUsuario(usuario);
    }

    Registro registro;
    registro.emergencia = emergencia;
    registro.reporteId = reporteId;
    registro.informe = informe;
    registro.justificacion = justificacion;
    registro.origen = origen;
    registro.tieneUbicacion = tieneUbicacion;
    registros[id] = registro;

    return aJson(registros[id]);
}

json ServicioOperaciones::listarEmergencias(const std::string &estado,
                                            const std::string &departamento) const {
    std::lock_guard<std::mutex> bloqueo(mutex);
    const std::string filtroDepartamento = normalizarDepartamento(departamento);
    std::vector<json> items;
    for (const auto &par : registros) {
        const json item = aJson(par.second);
        if (!filtroDepartamento.empty()) {
            bool pertenece = false;
            for (const json &depto : item["departamentos"]) {
                if (depto.get<std::string>() == filtroDepartamento) {
                    pertenece = true;
                    break;
                }
            }
            if (!pertenece) continue;
        }
        if (!estado.empty() && item["estado"].get<std::string>() != estado) {
            continue;
        }
        items.push_back(item);
    }

    std::sort(items.begin(), items.end(), [](const json &a, const json &b) {
        if (a["severidad"].get<int>() != b["severidad"].get<int>()) {
            return a["severidad"].get<int>() < b["severidad"].get<int>();
        }
        if (a["fecha"].get<std::string>() != b["fecha"].get<std::string>()) {
            return a["fecha"].get<std::string>() < b["fecha"].get<std::string>();
        }
        return a["id"].get<std::string>() < b["id"].get<std::string>();
    });

    json resultado = json::array();
    for (const json &item : items) resultado.push_back(item);
    return resultado;
}

json ServicioOperaciones::obtenerEmergencia(const std::string &id) const {
    std::lock_guard<std::mutex> bloqueo(mutex);
    const auto it = registros.find(id);
    if (it == registros.end()) {
        throw ErrorOperacion(404, "Emergencia no encontrada.");
    }
    return aJson(it->second);
}

json ServicioOperaciones::atender(const std::string &id,
                                  const std::string &departamento,
                                  bool atendida) {
    std::lock_guard<std::mutex> bloqueo(mutex);
    auto it = registros.find(id);
    if (it == registros.end()) {
        throw ErrorOperacion(404, "Emergencia no encontrada.");
    }

    Registro &registro = it->second;
    const std::string normalizado = normalizarDepartamento(departamento);
    if (!departamentoValido(normalizado)) {
        throw ErrorOperacion(422, "Departamento inválido.");
    }
    const std::vector<std::string> departamentos =
        registro.emergencia.getDepartamentos();
    if (std::find(departamentos.begin(), departamentos.end(), normalizado) ==
        departamentos.end()) {
        throw ErrorOperacion(422, "El departamento no está asignado a la emergencia.");
    }

    if (atendida) {
        if (registro.atenciones[normalizado]) {
            return aJson(registro);
        }
        Usuario usuario;
        if (!gestor.atenderPorId(normalizado, id, usuario)) {
            throw ErrorOperacion(409, "La emergencia ya no está en esa cola.");
        }
        registro.atenciones[normalizado] = true;
        if (registro.unidad.empty()) {
            std::string idUnidad;
            if (recursos.asignarUnidad(usuario, idUnidad)) {
                registro.unidad = idUnidad;
            }
        }
    } else {
        registro.atenciones[normalizado] = false;
        if (!registro.unidad.empty()) {
            std::string idUnidad = registro.unidad;
            recursos.liberarUnidad(idUnidad);
            registro.unidad.clear();
        }
        Usuario usuario(registro.emergencia.getUbicacion(),
                        registro.emergencia.getTelefonoReportante(),
                        registro.emergencia.getSeveridad(),
                        normalizado);
        usuario.setId(id);
        gestor.registrarUsuario(usuario);
    }

    return aJson(registro);
}

json ServicioOperaciones::registrarUnidad(const std::string &departamento,
                                          const std::string &id, int x, int y,
                                          double efectividad, double velocidad) {
    std::lock_guard<std::mutex> bloqueo(mutex);
    const std::string normalizado = normalizarDepartamento(departamento);
    if (!departamentoValido(normalizado)) {
        throw ErrorOperacion(422, "Departamento inv?lido.");
    }
    if (id.empty()) {
        throw ErrorOperacion(422, "La unidad debe tener un identificador.");
    }
    if (x < 0 || x > 1000 || y < 0 || y > 1000) {
        throw ErrorOperacion(422, "Las coordenadas deben estar entre 0 y 1000.");
    }
    try {
        recursos.registrarUnidad(normalizado, id, efectividad, velocidad,
                                 coordenadas(x, y));
    } catch (const std::invalid_argument &excepcion) {
        throw ErrorOperacion(409, excepcion.what());
    }
    guardarUnidadesSinBloqueo();
    for (const UnidadVista &unidad : recursos.listarUnidades()) {
        if (unidad.id == id) {
            return {
                {"id", unidad.id},
                {"nombre", unidad.id},
                {"departamento", unidad.departamento},
                {"estado", "disponible"},
                {"disponible", true},
                {"x", unidad.x},
                {"y", unidad.y},
                {"efectividad", unidad.efectividad},
                {"velocidad", unidad.velocidad},
            };
        }
    }
    throw ErrorOperacion(500, "La unidad se registr? pero no se pudo leer.");
}

json ServicioOperaciones::listarUnidades() const {
    std::lock_guard<std::mutex> bloqueo(mutex);
    json unidades = json::array();
    for (const UnidadVista &unidad : recursos.listarUnidades()) {
        json item;
        item["id"] = unidad.id;
        item["nombre"] = unidad.id;
        item["departamento"] = unidad.departamento;
        item["estado"] = unidad.asignada ? "en servicio" : "disponible";
        item["disponible"] = !unidad.asignada;
        item["x"] = unidad.x;
        item["y"] = unidad.y;
        item["efectividad"] = unidad.efectividad;
        item["velocidad"] = unidad.velocidad;
        unidades.push_back(item);
    }
    return unidades;
}

bool ServicioOperaciones::liberarUnidad(const std::string &id) {
    std::lock_guard<std::mutex> bloqueo(mutex);
    std::string idUnidad = id;
    if (!recursos.liberarUnidad(idUnidad)) {
        return false;
    }
    for (auto &par : registros) {
        if (par.second.unidad == id) {
            par.second.unidad.clear();
        }
    }
    return true;
}

void ServicioOperaciones::reiniciar() {
    std::lock_guard<std::mutex> bloqueo(mutex);
    registros.clear();
    contador = 1000;
    gestor = GestorDepartamentos();
    recursos = GestorRecursos();
    cargarUnidadesSinBloqueo(unidadesFile);
}
