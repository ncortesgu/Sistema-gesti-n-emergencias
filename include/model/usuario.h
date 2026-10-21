#ifndef USUARIO_H
#define USUARIO_H

#include <string>
#include "model/coordenadas.h" 

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

    // funcion para definir cuando un usuario es mayor que otro en prioridad
    bool operator<(const Usuario& otro) const;
};

#endif // USUARIO_H


