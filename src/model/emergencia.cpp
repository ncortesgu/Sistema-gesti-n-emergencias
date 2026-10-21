#include "../../include/model/emergencia.h"

Emergencia::Emergencia() {
    severidad = 5;
    severidadEtiqueta = "Informativa";
    confianza = 0.0;
    requiereRevision = true;
    ubicacion = coordenadas();
}

std::string Emergencia::getId() const { return id; }
std::string Emergencia::getTexto() const { return texto; }
std::string Emergencia::getTranscripcion() const { return transcripcion; }
int Emergencia::getSeveridad() const { return severidad; }
std::string Emergencia::getSeveridadEtiqueta() const { return severidadEtiqueta; }
std::string Emergencia::getDepartamentoPrincipal() const { return departamentoPrincipal; }
std::vector<std::string> Emergencia::getDepartamentos() const { return departamentos; }
double Emergencia::getConfianza() const { return confianza; }
bool Emergencia::isRequiereRevision() const { return requiereRevision; }
std::string Emergencia::getProveedor() const { return proveedor; }
std::string Emergencia::getModelo() const { return modelo; }
std::string Emergencia::getAdvertencia() const { return advertencia; }
std::string Emergencia::getTelefonoReportante() const { return telefonoReportante; }
coordenadas Emergencia::getUbicacion() const { return ubicacion; }
std::string Emergencia::getFechaHora() const { return fechaHora; }

void Emergencia::setId(const std::string &nuevoId) { id = nuevoId; }
void Emergencia::setTexto(const std::string &nuevoTexto) { texto = nuevoTexto; }
void Emergencia::setTranscripcion(const std::string &nuevaTranscripcion) {
    transcripcion = nuevaTranscripcion;
}
void Emergencia::setSeveridad(int nuevaSeveridad) { severidad = nuevaSeveridad; }
void Emergencia::setSeveridadEtiqueta(const std::string &nuevaEtiqueta) {
    severidadEtiqueta = nuevaEtiqueta;
}
void Emergencia::setDepartamentoPrincipal(const std::string &nuevoDepartamento) {
    departamentoPrincipal = nuevoDepartamento;
}
void Emergencia::setDepartamentos(const std::vector<std::string> &nuevosDepartamentos) {
    departamentos = nuevosDepartamentos;
}
void Emergencia::setConfianza(double nuevaConfianza) { confianza = nuevaConfianza; }
void Emergencia::setRequiereRevision(bool nuevoValor) { requiereRevision = nuevoValor; }
void Emergencia::setProveedor(const std::string &nuevoProveedor) { proveedor = nuevoProveedor; }
void Emergencia::setModelo(const std::string &nuevoModelo) { modelo = nuevoModelo; }
void Emergencia::setAdvertencia(const std::string &nuevaAdvertencia) {
    advertencia = nuevaAdvertencia;
}
void Emergencia::setTelefonoReportante(const std::string &nuevoTelefono) {
    telefonoReportante = nuevoTelefono;
}
void Emergencia::setUbicacion(coordenadas nuevaUbicacion) { ubicacion = nuevaUbicacion; }
void Emergencia::setFechaHora(const std::string &nuevaFechaHora) { fechaHora = nuevaFechaHora; }
