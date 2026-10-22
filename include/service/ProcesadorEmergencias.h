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

/**
 * @brief Tipo de solicitud que espera ser clasificada.
 */
enum class TipoSolicitud { TEXTO, AUDIO };

/**
 * @brief Elemento que espera en la cola de entrada.
 */
struct SolicitudEntrante {
    TipoSolicitud tipo;
    std::string contenido;
};

/**
 * @brief Pipeline de entrada de reportes hacia las colas por departamento.
 *
 * ESTRUCTURA DE DATOS: COLA FIFO (std::queue).
 *
 * La cola de entrada (`colaEntrada`) es un `std::queue<SolicitudEntrante>`. La STL la
 * implementa sobre un contenedor asociativo secuencial (deque) que internamente es una
 * lista doblemente enlazada de bloques, por lo que insertar y extraer son operaciones de
 * tiempo constante y sin realocaciones.
 *
 * - Por qué (FIFO): un reporte de emergencia debe clasificarse en el mismo orden en que
 *   llegó la persona que lo reportó. Con una cola, el primero que entra es el primero que
 *   sale (First In, First Out) y nunca se altera el orden de los reportes.
 * - Cómo: `encolarTexto` y `encolarAudio` insertan al final (`push`) y
 *   `procesarSiguiente`/`procesarTodas` extraen del frente (`front` + `pop`).
 *
 * La salida de este procesador se registra en `GestorDepartamentos`, que usa COLAS CON
 * PRIORIDAD (una por departamento). El ARREGLO DINÁMICO aparece en dos lugares del
 * proyecto: aquí, en `procesarTodas` (`std::vector<Emergencia>` con los reportes
 * clasificados) y en el panel web, donde el historial de clasificaciones es un `Array` de
 * JavaScript que crece y se recorta en el navegador.
 *
 * @see docs/ESTRUCTURAS_DATOS.md
 */
class ProcesadorEmergencias {
private:
    ClienteClasificador &cliente;
    GestorDepartamentos &gestor;
    GeneradorDatos generador;

    /**
     * @brief Cola de entrada de solicitudes: FIFO de reportes por clasificar.
     */
    std::queue<SolicitudEntrante> colaEntrada;

    /**
     * @brief Registra la emergencia clasificada en la cola de prioridad de cada
     *        departamento asignado.
     */
    void registrarEnColas(const Emergencia &emergencia);

public:
    ProcesadorEmergencias(ClienteClasificador &cliente, GestorDepartamentos &gestor);

    /**
     * @brief Agrega al final de la cola de entrada una solicitud de texto.
     */
    void encolarTexto(const std::string &texto);

    /**
     * @brief Agrega al final de la cola de entrada una solicitud de audio.
     */
    void encolarAudio(const std::string &rutaAudio);

    /**
     * @brief Cantidad de solicitudes que siguen sin clasificar.
     */
    std::size_t pendientes() const;

    /**
     * @brief Clasifica la siguiente solicitud de la cola de entrada (FIFO).
     * @param salida Emergencia ya clasificada y enriquecida.
     * @param error Mensaje de error si no se pudo procesar.
     * @return true si se procesó una solicitud.
     */
    bool procesarSiguiente(Emergencia &salida, std::string &error);

    /**
     * @brief Procesa todas las solicitudes pendientes de la cola de entrada.
     */
    std::vector<Emergencia> procesarTodas(std::vector<std::string> &errores);

    /**
     * @brief Atiende la emergencia más prioritaria de un departamento.
     */
    bool atenderSiguiente(const std::string &departamento, Usuario &usuario,
                          std::string &error);

    /**
     * @brief Indica si un departamento tiene emergencias en espera.
     */
    bool hayEnEspera(const std::string &departamento);

    /**
     * @brief Departamentos conocidos por el sistema.
     */
    static const std::vector<std::string> &departamentosConocidos();
};

#endif // PROCESADOR_EMERGENCIAS_H
