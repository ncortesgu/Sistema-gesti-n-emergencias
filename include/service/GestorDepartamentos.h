#ifndef GESTOR_DEPARTAMENTOS_H
#define GESTOR_DEPARTAMENTOS_H

#include <map>
#include <queue>
#include <string>
#include "model/usuario.h"

class GestorDepartamentos {
private:
    // Mapa que asocia el nombre del departamento con su respectiva cola de prioridad
    std::map<std::string, std::priority_queue<Usuario>> departamentos;

public:
    // Constructor
    GestorDepartamentos();

    // Métodos principales
    void registrarUsuario(Usuario usuario);
    Usuario atenderSiguiente(std::string nombreDepartamento);
    bool hayUsuariosEnEspera(std::string nombreDepartamento);
};

#endif // GESTOR_DEPARTAMENTOS_H