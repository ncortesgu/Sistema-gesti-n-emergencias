#include <chrono>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

#include "model/emergencia.h"
#include "model/usuario.h"
#include "service/ClienteClasificador.h"
#include "service/GestorDepartamentos.h"
#include "service/GrabadorAudio.h"
#include "service/GeneradorDatos.h"
#include "service/ProcesadorEmergencias.h"

namespace {

std::string recortar(const std::string &texto) {
    const std::size_t inicio = texto.find_first_not_of(" \t\r\n");
    if (inicio == std::string::npos) {
        return "";
    }
    const std::size_t fin = texto.find_last_not_of(" \t\r\n");
    return texto.substr(inicio, fin - inicio + 1);
}

std::string variableEntorno(const std::string &nombre, const std::string &defecto) {
    const char *valor = std::getenv(nombre.c_str());
    if (valor != nullptr && std::string(valor).size() > 0) {
        return valor;
    }

    auto leerDeArchivo = [&nombre](const std::filesystem::path &ruta) -> std::string {
        std::ifstream archivo(ruta);
        std::string linea;
        while (std::getline(archivo, linea)) {
            linea = recortar(linea);
            if (linea.empty() || linea.front() == '#') {
                continue;
            }
            const std::size_t separador = linea.find('=');
            if (separador == std::string::npos) {
                continue;
            }
            if (recortar(linea.substr(0, separador)) == nombre) {
                return recortar(linea.substr(separador + 1));
            }
        }
        return "";
    };

    std::error_code errorRuta;
    std::filesystem::path directorio = std::filesystem::current_path(errorRuta);
    for (int nivel = 0; nivel < 4 && !directorio.empty(); ++nivel) {
        const std::string encontrado = leerDeArchivo(directorio / ".env");
        if (!encontrado.empty()) {
            return encontrado;
        }
        const std::filesystem::path padre = directorio.parent_path();
        if (padre == directorio) {
            break;
        }
        directorio = padre;
    }
    return defecto;
}

std::string leerLinea(const std::string &etiqueta) {
    std::cout << etiqueta;
    std::string linea;
    std::getline(std::cin, linea);
    return recortar(linea);
}

int leerEntero(const std::string &etiqueta, int defecto) {
    const std::string linea = leerLinea(etiqueta);
    if (linea.empty()) {
        return defecto;
    }
    try {
        return std::stoi(linea);
    } catch (const std::exception &) {
        return defecto;
    }
}

std::string juntar(const std::vector<std::string> &valores) {
    std::ostringstream salida;
    for (std::size_t i = 0; i < valores.size(); ++i) {
        if (i > 0) {
            salida << ", ";
        }
        salida << valores[i];
    }
    return salida.str();
}

std::string rutaGrabacion(const std::string &directorio) {
    const auto ahora = std::chrono::system_clock::now();
    const std::time_t tiempo = std::chrono::system_clock::to_time_t(ahora);
    std::tm desglose{};
#ifdef _WIN32
    localtime_s(&desglose, &tiempo);
#else
    localtime_r(&tiempo, &desglose);
#endif
    std::ostringstream nombre;
    nombre << "emergencia_" << std::put_time(&desglose, "%Y%m%d_%H%M%S") << ".wav";
    return (std::filesystem::path(directorio) / nombre.str()).string();
}

void imprimirEmergencia(const Emergencia &emergencia) {
    std::cout << "\n=== EMERGENCIA " << emergencia.getId() << " ===\n";
    if (!emergencia.getTranscripcion().empty()) {
        std::cout << "Transcripción: " << emergencia.getTranscripcion() << "\n";
    }
    std::cout << "Texto: " << emergencia.getTexto() << "\n";
    std::cout << "Severidad: " << emergencia.getSeveridad() << " ("
              << emergencia.getSeveridadEtiqueta() << ")\n";
    std::cout << "Departamento principal: " << emergencia.getDepartamentoPrincipal() << "\n";
    std::cout << "Departamentos asignados: " << juntar(emergencia.getDepartamentos())
              << "\n";

    std::ostringstream confianza;
    confianza << std::fixed << std::setprecision(2) << emergencia.getConfianza();
    std::cout << "Confianza: " << confianza.str() << " | proveedor: "
              << emergencia.getProveedor() << " | modelo: " << emergencia.getModelo() << "\n";

    if (emergencia.isRequiereRevision()) {
        std::cout << "*** REQUIERE REVISIÓN HUMANA ***\n";
    }
    if (!emergencia.getAdvertencia().empty()) {
        std::cout << "Advertencia: " << emergencia.getAdvertencia() << "\n";
    }

    std::cout << "Teléfono del reportante: " << emergencia.getTelefonoReportante() << "\n";
    std::cout << "Ubicación (X, Y): "
              << GeneradorDatos::formatearCoordenada(emergencia.getUbicacion()) << "\n";
    std::cout << "Registrada en: " << juntar(emergencia.getDepartamentos()) << "\n";
    std::cout << "Fecha: " << emergencia.getFechaHora() << "\n";
}

void imprimirUsuario(const std::string &departamento, const Usuario &usuario) {
    std::cout << "\n>>> ATENDIENDO EN " << departamento << " (prioridad "
              << usuario.getPrioridad() << ")\n";
    std::cout << "Teléfono: " << usuario.getTelefono() << "\n";
    std::cout << "Ubicación (X, Y): "
              << GeneradorDatos::formatearCoordenada(usuario.getUbicacion()) << "\n";
    std::cout << "Estado: " << (usuario.isAtendido() ? "atendido" : "pendiente") << "\n";
}

void imprimirMenu(const std::string &proveedor, const std::string &baseUrl) {
    std::cout << "\n============================================================\n";
    std::cout << " SISTEMA DE GESTIÓN DE EMERGENCIAS\n";
    std::cout << " Clasificador: " << baseUrl << " | proveedor: " << proveedor << "\n";
    std::cout << "============================================================\n";
    std::cout << " 1. Encolar emergencia por texto\n";
    std::cout << " 2. Encolar emergencia por audio (archivo)\n";
    std::cout << " 3. Grabar emergencia por micrófono\n";
    std::cout << " 4. Procesar siguiente de la cola de entrada\n";
    std::cout << " 5. Procesar todas las pendientes\n";
    std::cout << " 6. Atender siguiente emergencia por departamento\n";
    std::cout << " 7. Ver estado de colas\n";
    std::cout << " 8. Cambiar proveedor de clasificación\n";
    std::cout << " 9. Listar micrófonos disponibles\n";
    std::cout << " 0. Salir\n";
}

std::string elegirDepartamento() {
    const auto &departamentos = ProcesadorEmergencias::departamentosConocidos();
    std::cout << "Departamentos: ";
    for (std::size_t i = 0; i < departamentos.size(); ++i) {
        std::cout << "[" << (i + 1) << "] " << departamentos[i] << " ";
    }
    std::cout << "\n";
    const std::string entrada = leerLinea("Elige el número o el nombre: ");
    try {
        const int indice = std::stoi(entrada);
        if (indice >= 1 && indice <= static_cast<int>(departamentos.size())) {
            return departamentos[static_cast<std::size_t>(indice - 1)];
        }
    } catch (const std::exception &) {
        // Se intenta interpretar como nombre.
    }
    return entrada;
}

} // namespace

int main() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif

    const std::string baseUrl =
        variableEntorno("CLASIFICADOR_URL", "http://127.0.0.1:8100");
    const std::string directorioAudios =
        variableEntorno("DIRECTORIO_AUDIOS", "audios");

    std::string proveedor = variableEntorno("PROVEEDOR_CLASIFICACION", "laya");
    std::error_code errorDirectorio;
    std::filesystem::create_directories(directorioAudios, errorDirectorio);

    GestorDepartamentos gestor;
    ClienteClasificador cliente(baseUrl);
    ProcesadorEmergencias procesador(cliente, gestor);

    std::cout << "Sistema de gestión de emergencias\n";
    std::cout << "Conectando con el clasificador en " << baseUrl << "...\n";
    std::string errorSalud;
    if (!cliente.salud(errorSalud)) {
        std::cout << "ADVERTENCIA: " << errorSalud << "\n";
        std::cout << "Puedes seguir usando la consola, pero las clasificaciones fallarán "
                     "hasta que el servicio esté disponible.\n";
    } else {
        std::cout << "Clasificador disponible.\n";
    }

    bool ejecutando = true;
    while (ejecutando) {
        imprimirMenu(proveedor, baseUrl);
        const std::string opcion = leerLinea("Opción: ");

        if (opcion == "1") {
            const std::string texto = leerLinea(
                "Describe la emergencia: ");
            if (texto.size() < 3) {
                std::cout << "El texto es demasiado corto.\n";
                continue;
            }
            procesador.encolarTexto(texto);
            std::cout << "Emergencia encolada. Pendientes: " << procesador.pendientes()
                      << ". Usa la opción 4 o 5 para clasificarla.\n";
        } else if (opcion == "2") {
            const std::string ruta = leerLinea("Ruta del archivo de audio: ");
            if (ruta.empty() || !std::filesystem::exists(ruta)) {
                std::cout << "No se encontró el archivo indicado.\n";
                continue;
            }
            procesador.encolarAudio(ruta);
            std::cout << "Audio encolado. Pendientes: " << procesador.pendientes() << ".\n";
        } else if (opcion == "3") {
            const int segundos = leerEntero(
                "Segundos de grabación (Enter = 8, máximo 30): ", 8);
            if (segundos <= 0 || segundos > 30) {
                std::cout << "Duración inválida.\n";
                continue;
            }
            const std::string ruta = rutaGrabacion(directorioAudios);
            std::cout << "Grabando " << segundos << " segundos...\n";
            std::string errorGrabacion;
            if (!GrabadorAudio::grabarWav(ruta, segundos, errorGrabacion)) {
                std::cout << "Error al grabar: " << errorGrabacion << "\n";
                continue;
            }
            std::cout << "Audio guardado en " << ruta << ". Encolando...\n";
            procesador.encolarAudio(ruta);
        } else if (opcion == "4") {
            Emergencia emergencia;
            std::string error;
            if (!procesador.procesarSiguiente(emergencia, error)) {
                std::cout << "No se pudo procesar: " << error << "\n";
                continue;
            }
            imprimirEmergencia(emergencia);
        } else if (opcion == "5") {
            std::vector<std::string> errores;
            const std::vector<Emergencia> procesadas = procesador.procesarTodas(errores);
            for (const Emergencia &emergencia : procesadas) {
                imprimirEmergencia(emergencia);
            }
            for (const std::string &error : errores) {
                std::cout << "Error: " << error << "\n";
            }
            std::cout << "\nProcesadas: " << procesadas.size()
                      << " | errores: " << errores.size() << "\n";
        } else if (opcion == "6") {
            const std::string departamento = elegirDepartamento();
            Usuario usuario;
            std::string error;
            if (!procesador.atenderSiguiente(departamento, usuario, error)) {
                std::cout << error << "\n";
                continue;
            }
            imprimirUsuario(departamento, usuario);
        } else if (opcion == "7") {
            std::cout << "\nEstado de las colas:\n";
            for (const std::string &departamento :
                 ProcesadorEmergencias::departamentosConocidos()) {
                std::cout << " - " << departamento << ": "
                          << (procesador.hayEnEspera(departamento) ? "con emergencias"
                                                                   : "vacía")
                          << "\n";
            }
            std::cout << "Pendientes por clasificar: " << procesador.pendientes() << "\n";
        } else if (opcion == "8") {
            std::cout << "Proveedores: laya (local), jev (OpenRouter), reglas (respaldo).\n";
            const std::string nuevo = leerLinea("Nuevo proveedor: ");
            if (nuevo == "laya" || nuevo == "jev" || nuevo == "reglas") {
                proveedor = nuevo;
                std::cout << "Proveedor cambiado a " << proveedor << ".\n";
            } else {
                std::cout << "Proveedor inválido.\n";
            }
        } else if (opcion == "9") {
            const std::vector<std::string> dispositivos =
                GrabadorAudio::listarDispositivos();
            if (dispositivos.empty()) {
                std::cout << "No se encontraron micrófonos disponibles.\n";
            } else {
                std::cout << "Micrófonos de captura:\n";
                for (const std::string &dispositivo : dispositivos) {
                    std::cout << " - " << dispositivo << "\n";
                }
            }
        } else if (opcion == "0") {
            ejecutando = false;
        } else {
            std::cout << "Opción inválida.\n";
        }
    }

    std::cout << "Hasta luego.\n";
    return 0;
}
