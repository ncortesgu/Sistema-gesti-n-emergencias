#ifndef GESTOR_DEPARTAMENTOS_H
#define GESTOR_DEPARTAMENTOS_H

#include <map>
#include <queue>
#include <string>
#include <vector>
#include "model/usuario.h"

/**
 * @brief Gestor de colas de prioridad por departamento.
 *
 * ESTRUCTURA DE DATOS: COLA CON PRIORIDAD (std::priority_queue).
 *
 * Cada departamento (bomberos, policia, ambulancia, defensa_civil) tiene su propia
 * `std::priority_queue<Usuario>`. La STL implementa la cola con prioridad sobre un
 * contenedor asociativo (heap binario), de modo que:
 *
 * - insertar (`push`) y extraer (`top` + `pop`) son O(log n);
 * - el elemento con mayor prioridad (menor número de severidad) siempre queda en la cima
 *   (`top`), sin necesidad de reordenar toda la cola.
 *
 * - Por qué (cola con prioridad y no una cola simple): en una emergencia real no importa
 *   el orden de llegada sino la gravedad. Un incendio con personas atrapadas (severidad 1)
 *   debe salir antes que un robo del día anterior (severidad 4), aunque el robo se haya
 *   reportado primero. El comparador `Usuario::operator<` invierte el sentido para que el
 *   heap ponga arriba el número de prioridad más pequeño.
 * - Cómo: `registrarUsuario` inserta el reporte en la cola de su departamento; el
 *   operador (panel web o consola C++) usa `atenderSiguiente` para sacar el reporte más
 *   urgente, o `atenderPorId` para atender un reporte concreto desde el panel.
 *
 * @see docs/ESTRUCTURAS_DATOS.md
 */
class GestorDepartamentos {
private:
    /**
     * @brief Mapa que asocia el nombre del departamento con su cola de prioridad.
     *
     * Es un `std::map` (estructura asociativa, no lineal) porque se busca por nombre de
     * departamento de forma constante; dentro de cada valor vive la cola con prioridad.
     */
    std::map<std::string, std::priority_queue<Usuario>> departamentos;

public:
    /**
     * @brief Constructor: el mapa de colas inicia vacío.
     */
    GestorDepartamentos();

    /**
     * @brief Inserta un usuario en la cola de prioridad de su departamento.
     * @param usuario Reportante con prioridad, teléfono y ubicación.
     */
    void registrarUsuario(Usuario usuario);

    /**
     * @brief Extrae (y elimina) el usuario con mayor prioridad del departamento.
     * @return Usuario atendido, o un `Usuario` vacío si la cola no tiene pendientes.
     */
    Usuario atenderSiguiente(std::string nombreDepartamento);

    /**
     * @brief Extrae un usuario específico por identificador, sin tocar el orden del resto.
     * @param nombreDepartamento Cola a inspeccionar.
     * @param id Identificador del reporte (por ejemplo `EMG-1001`).
     * @param usuario Salida con el usuario encontrado.
     * @return true si el reporte estaba en esa cola.
     */
    bool atenderPorId(const std::string &nombreDepartamento, const std::string &id,
                      Usuario &usuario);

    /**
     * @brief Lista los usuarios en espera de un departamento (de mayor a menor prioridad).
     */
    std::vector<Usuario> listarUsuarios(const std::string &nombreDepartamento) const;

    /**
     * @brief Indica si un departamento tiene reportes en espera.
     */
    bool hayUsuariosEnEspera(std::string nombreDepartamento);
};

#endif // GESTOR_DEPARTAMENTOS_H
