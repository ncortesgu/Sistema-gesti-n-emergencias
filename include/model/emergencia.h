#ifndef EMERGENCIA_H
#define EMERGENCIA_H

#include <string>
#include <vector>

class Emergencia {
private:
    std::string id;
    std::string texto;
    std::string transcripcion;
    int severidad;
    std::string severidadEtiqueta;
    std::string departamentoPrincipal;
    std::vector<std::string> departamentos;
    double confianza;
    bool requiereRevision;
    std::string proveedor;
    std::string modelo;
    std::string advertencia;

    std::string nombreReportante;
    std::string cedulaReportante;
    std::string telefonoReportante;
    double latitud;
    double longitud;
    std::string fechaHora;

public:
    Emergencia();

    // Getters
    std::string getId() const;
    std::string getTexto() const;
    std::string getTranscripcion() const;
    int getSeveridad() const;
    std::string getSeveridadEtiqueta() const;
    std::string getDepartamentoPrincipal() const;
    std::vector<std::string> getDepartamentos() const;
    double getConfianza() const;
    bool isRequiereRevision() const;
    std::string getProveedor() const;
    std::string getModelo() const;
    std::string getAdvertencia() const;
    std::string getNombreReportante() const;
    std::string getCedulaReportante() const;
    std::string getTelefonoReportante() const;
    double getLatitud() const;
    double getLongitud() const;
    std::string getFechaHora() const;

    // Setters
    void setId(const std::string &nuevoId);
    void setTexto(const std::string &nuevoTexto);
    void setTranscripcion(const std::string &nuevaTranscripcion);
    void setSeveridad(int nuevaSeveridad);
    void setSeveridadEtiqueta(const std::string &nuevaEtiqueta);
    void setDepartamentoPrincipal(const std::string &nuevoDepartamento);
    void setDepartamentos(const std::vector<std::string> &nuevosDepartamentos);
    void setConfianza(double nuevaConfianza);
    void setRequiereRevision(bool nuevoValor);
    void setProveedor(const std::string &nuevoProveedor);
    void setModelo(const std::string &nuevoModelo);
    void setAdvertencia(const std::string &nuevaAdvertencia);
    void setNombreReportante(const std::string &nuevoNombre);
    void setCedulaReportante(const std::string &nuevaCedula);
    void setTelefonoReportante(const std::string &nuevoTelefono);
    void setLatitud(double nuevaLatitud);
    void setLongitud(double nuevaLongitud);
    void setFechaHora(const std::string &nuevaFechaHora);
};

#endif // EMERGENCIA_H
