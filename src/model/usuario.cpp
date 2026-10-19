#include "../../include/model/usuario.h"

// Constructor vacio
Usuario::Usuario() {
    nombre = "";
    cedula = "";
    telefono = "";
    prioridad = 5;
    departamento = "";
    atendido = false;
}

// Constructor con parametros
Usuario::Usuario(std::string nombre, std::string cedula, std::string telefono, int prioridad, std::string departamento) {
    this->nombre = nombre;
    this->cedula = cedula;
    this->telefono = telefono;
    this->prioridad = prioridad;
    this->departamento = departamento;
    this->atendido = false;
}

// Getters
std::string Usuario::getNombre()const 
{ return nombre; }
std::string Usuario::getCedula()const 
{ return cedula; }
std::string Usuario::getTelefono()const
 { return telefono; }
int Usuario::getPrioridad()const 
{ return prioridad; }
std::string Usuario::getDepartamento()const 
{ return departamento; }
bool Usuario::isAtendido()const 
{ return atendido; }



// Setters
void Usuario::setNombre(std::string nuevoNombre) 
{ nombre = nuevoNombre; }
void Usuario::setCedula(std::string nuevaCedula) 
{ cedula = nuevaCedula; }
void Usuario::setTelefono(std::string nuevoTelefono) 
{ telefono = nuevoTelefono; }
void Usuario::setPrioridad(int nuevaPrioridad) 
{ prioridad = nuevaPrioridad; }
void Usuario::setDepartamento(std::string nuevoDepartamento) 
{ departamento = nuevoDepartamento; }
void Usuario::setAtendido(bool nuevoEstado)
 { atendido = nuevoEstado; }

// comparacion entre 2 usuarios por medio de la prioridad de su emergencia 

 bool Usuario::operator<(Usuario otro)const{
    return prioridad > otro.getPrioridad();
 }