#ifndef USUARIO_H
#define USUARIO_H

#include <string>
#include "model/coordenadas.h" 

/**
 * @brief Reportante de una emergencia en espera de atención.
 *
 * ESTRUCTURA DE DATOS RELACIONADA: COLA CON PRIORIDAD.
 *
 * El atributo `prioridad` es la clave de ordenamiento de las colas por departamento:
 * copia directamente la severidad de la emergencia (1 = crítica … 5 = informativa) y
 * `operator<` está invertido para que el heap de `std::priority_queue` saque primero el
 * número más bajo, es decir, la emergencia más grave.
 */
class Usuario {
private:
    std::string id;
    coordenadas ubicacion;
    std::string telefono;
    int prioridad;
    std::string departamento;
    bool atendido;

public:
    // Constructores
    Usuario();
    Usuario(coordenadas ubicacion, std::string telefono, int prioridad, std::string departamento);

    // Getters
    coordenadas getUbicacion() const;
    std::string getTelefono() const;
    int getPrioridad() const;
    std::string getDepartamento() const;
    std::string getId() const;
    bool isAtendido() const;

    // Setters
    void setUbicacion(coordenadas nuevaUbicacion);
    void setTelefono(std::string nuevoTelefono);
    void setPrioridad(int nuevaPrioridad);
    void setDepartamento(std::string nuevoDepartamento);
    void setAtendido(bool nuevoEstado);
    void setId(std::string nuevoId);

    /**
     * @brief Compara por prioridad para la cola con prioridad.
     * @return true si este usuario tiene **menor** prioridad (más urgente) que el otro.
     *         Por eso `std::priority_queue` lo saca primero de la cola.
     */
    bool operator<(const Usuario& otro) const;
};

#endif // USUARIO_H


