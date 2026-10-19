#ifndef USUARIO_H
#define USUARIO_H

#include <string>

class Usuario {
private:
    std::string nombre;
    std::string cedula;
    std::string telefono;
    int prioridad;
    std::string departamento;
    bool atendido;

public:
    // Constructores
    Usuario();
    Usuario(std::string nombre, std::string cedula, std::string telefono, int prioridad, std::string departamento);

    // Getters
    std::string getNombre()const;
    std::string getCedula()const;
    std::string getTelefono()const;
    int getPrioridad()const;
    std::string getDepartamento()const;
    bool isAtendido()const;

    // Setters
    void setNombre(std::string nuevoNombre);
    void setCedula(std::string nuevaCedula);
    void setTelefono(std::string nuevoTelefono);
    void setPrioridad(int nuevaPrioridad);
    void setDepartamento(std::string nuevoDepartamento);
    void setAtendido(bool nuevoEstado);

    // declaracion de operador para clase usuario

    bool operator<(Usuario otro)const;

};

#endif // USUARIO_H

