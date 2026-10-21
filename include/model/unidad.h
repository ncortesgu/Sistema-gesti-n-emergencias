#ifndef UNIDAD_H
#define UNIDAD_H

#include <cmath>
#include <algorithm>
#include <iostream>
#include <string>
#include <stdexcept>
#include "model/coordenadas.h"
#include "model/usuario.h"

class Unidad {
    private:
    // Atributos de la unidad
        std::string id; // identificacion de la unidad ej: "AMB-001"
        coordenadas ubicacion; // Coordenadas de la unidad
        // Atributos para la simulacion de la atención
        double efectividad;
        double velocidad;
        bool asignada;

    public:
        // Constructor
        Unidad(std::string id, double efectividad, double velocidad);
        Unidad();
    // Getters
        std::string getId() const;
        coordenadas getUbicacion() const;
        double getEfectividad() const;
        double getVelocidad() const;
    // Setters
        void setId(const std::string& id);
        void setAsignada(bool disponible);
        void setUbicacion(const coordenadas& ubicacion);
        void setEfectividad(double efectividad);
        void setVelocidad(double velocidad);
    // Método para mostrar la información de la unidad
        void mostrarInformacion() const;
        bool isAsignada() const;
        
    // Métodos para calcular tiempo de atención y distancia
        double calcularTiempoTotalEstimado(Usuario& usuario) const; // Tiempo total de atención basado en la efectividad y velocidad de la unidad
        double calcularDistancia(const coordenadas& ubicacion) const;
};


#endif //UNIDAD_H