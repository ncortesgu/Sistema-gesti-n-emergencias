#include "../../include/model/unidad.h"

Unidad::Unidad(std::string id, double efectividad, double velocidad) : id(id), efectividad(efectividad), velocidad(velocidad), asignada(false) {
    // Inicializar la ubicación de la unidad en (0, 0)
    ubicacion.setX(0);
    ubicacion.setY(0);
}
Unidad::Unidad() : id(""), ubicacion(), efectividad(1.0), velocidad(10.0), asignada(false) {}
// Getters
std::string Unidad::getId() const {
    return id;
}
coordenadas Unidad::getUbicacion() const {
    return ubicacion;
}
double Unidad::getEfectividad() const {
    return efectividad;
}
double Unidad::getVelocidad() const {
    return velocidad;
}

// Setters
void Unidad::setId(const std::string& id) {
    this->id = id;
}
void Unidad::setAsignada(bool asignada) {
    this->asignada = asignada;
}   
void Unidad::setUbicacion(const coordenadas& ubicacion) {
    this->ubicacion = ubicacion;
}
void Unidad::setEfectividad(double efectividad) {
    this->efectividad = efectividad;
}
void Unidad::setVelocidad(double velocidad) {
    //if(velocidad <= 0) {
    //    throw std::invalid_argument("La velocidad debe ser mayor que cero.");
    //}

    if(velocidad > 0) this->velocidad = velocidad;
}

// Implementación del método para mostrar la información de la unidad
void Unidad::mostrarInformacion() const {
    std::cout << "ID: " << id << std::endl;
    std::cout << "Ubicación: (" << ubicacion.getX() << ", " << ubicacion.getY() << ")" << std::endl;
    std::cout << "Efectividad: " << efectividad << std::endl;
    std::cout << "Velocidad: " << velocidad << std::endl;
    std::cout << "Asignada: " << (asignada ? "Sí" : "No") << std::endl;
}

bool Unidad::isAsignada() const {
    return asignada;
}

//Distancia entre la unidad y el usuario
double Unidad::calcularDistancia(const coordenadas& ubicacion) const {
    double dx = this->ubicacion.getX() - ubicacion.getX();
    double dy = this->ubicacion.getY() - ubicacion.getY();

    return std::sqrt(dx * dx + dy * dy);
}

double Unidad::calcularTiempoTotalEstimado(Usuario& usuario) const {
    // Calcular el tiempo de atención basado en la efectividad y velocidad de la unidad
    double tiempoBase = 10.0; // Tiempo base de atención en minutos
    double tiempoEfectividad = tiempoBase / efectividad; // Ajuste por efectividad
    double tiempoVelocidad = 60 * calcularDistancia(usuario.getUbicacion()) / velocidad; // Ajuste por velocidad

    return tiempoEfectividad + tiempoVelocidad;
    
} 