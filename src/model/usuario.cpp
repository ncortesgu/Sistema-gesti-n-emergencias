#include "../../include/model/usuario.h"

// Constructor vacio
Usuario::Usuario() {
    this->ubicacion = coordenadas(); 
    this->telefono = "";
    this->prioridad = 5;
    this->departamento = "";
    this->atendido = false;
}

// Constructor con parametros
Usuario::Usuario(coordenadas ubicacion, std::string telefono, int prioridad, std::string departamento) {
    this->ubicacion = ubicacion;
    this->telefono = telefono;
    this->prioridad = prioridad;
    this->departamento = departamento;
    this->atendido = false;
}

// Getters
coordenadas Usuario::getUbicacion() const { return ubicacion; }
std::string Usuario::getTelefono() const { return telefono; }
int Usuario::getPrioridad() const { return prioridad; }
std::string Usuario::getDepartamento() const { return departamento; }
bool Usuario::isAtendido() const { return atendido; }

// Setters
void Usuario::setUbicacion(coordenadas nuevaUbicacion) { ubicacion = nuevaUbicacion; }
void Usuario::setTelefono(std::string nuevoTelefono) { telefono = nuevoTelefono; }
void Usuario::setPrioridad(int nuevaPrioridad) { prioridad = nuevaPrioridad; }
void Usuario::setDepartamento(std::string nuevoDepartamento) { departamento = nuevoDepartamento; }
void Usuario::setAtendido(bool nuevoEstado) { atendido = nuevoEstado; }

// definicion de mayor o menor para la cola de prioridad 
bool Usuario::operator<(const Usuario& otro) const {
    return prioridad > otro.prioridad; // Menor numero representa mayor prioridad (1 es mas urgente que 5)
}