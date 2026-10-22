#include "../../include/service/GestorDepartamentos.h"

GestorDepartamentos::GestorDepartamentos() {
    // El mapa se inicializa vacío automáticamente
}

// Registra un usuario en la cola de su departamento correspondiente
void GestorDepartamentos::registrarUsuario(Usuario usuario) {
    departamentos[usuario.getDepartamento()].push(usuario);
}

// Obtiene y remueve al usuario con mayor prioridad de un departamento
Usuario GestorDepartamentos::atenderSiguiente(std::string nombreDepartamento) {
    // Verificamos si la cola de ese departamento existe y no está vacía
    if (departamentos.find(nombreDepartamento) != departamentos.end() && !departamentos[nombreDepartamento].empty()) {
        
        // Tomamos al usuario con mayor prioridad (el que está al frente/top)
        Usuario atendido = departamentos[nombreDepartamento].top();
        
        // Lo sacamos de la cola
        departamentos[nombreDepartamento].pop();
        
        // Le cambiamos el estado a atendido
        atendido.setAtendido(true);
        
        return atendido;
    }
    
    // Si la cola está vacía, retornamos un usuario vacío
    return Usuario();
}


// Verifica si hay pacientes esperando en un departamento específico
bool GestorDepartamentos::atenderPorId(const std::string &nombreDepartamento,
                                       const std::string &id, Usuario &usuario) {
    auto it = departamentos.find(nombreDepartamento);
    if (it == departamentos.end() || it->second.empty()) {
        return false;
    }

    std::priority_queue<Usuario> copia = it->second;
    std::vector<Usuario> pendientes;
    bool encontrado = false;

    while (!copia.empty()) {
        Usuario actual = copia.top();
        copia.pop();
        if (actual.getId() == id) {
            actual.setAtendido(true);
            usuario = actual;
            encontrado = true;
            break;
        }
        pendientes.push_back(actual);
    }

    if (!encontrado) {
        return false;
    }

    for (const Usuario &pendiente : pendientes) {
        copia.push(pendiente);
    }
    it->second = copia;
    return true;
}

std::vector<Usuario> GestorDepartamentos::listarUsuarios(
    const std::string &nombreDepartamento) const {
    std::vector<Usuario> usuarios;
    auto it = departamentos.find(nombreDepartamento);
    if (it == departamentos.end()) {
        return usuarios;
    }

    std::priority_queue<Usuario> copia = it->second;
    while (!copia.empty()) {
        usuarios.push_back(copia.top());
        copia.pop();
    }
    return usuarios;
}

bool GestorDepartamentos::hayUsuariosEnEspera(std::string nombreDepartamento) {
    if (departamentos.find(nombreDepartamento) != departamentos.end()) {
        return !departamentos[nombreDepartamento].empty();
    }
    return false;
}

