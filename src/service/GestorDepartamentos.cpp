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
bool GestorDepartamentos::hayUsuariosEnEspera(std::string nombreDepartamento) {
    if (departamentos.find(nombreDepartamento) != departamentos.end()) {
        return !departamentos[nombreDepartamento].empty();
    }
    return false;
}

