#include <iostream>
#include <string>

// Importamos los contratos de nuestras capas
#include "include/model/usuario.h"
#include "include/service/GestorDepartamentos.h"

int main() {
    
    GestorDepartamentos deptos;

    Usuario u1("carlos","1021396112","3187341934",5,"bomberos");
    Usuario u2("miguel","1021300000","3187341934",3,"bomberos");
    Usuario u3("jose","0000096112","3187341934",2,"bomberos");
    Usuario u4("juan","2929292929","3187341934",2,"bomberos");

        deptos.registrarUsuario(u1);
        deptos.registrarUsuario(u2);
        deptos.registrarUsuario(u3);
        deptos.registrarUsuario(u4);  
    
    if(deptos.hayUsuariosEnEspera("bomberos")){
        std::cout<<"hay usuarios esperando en la cola de bomberos." << std::endl;
    }
    else{
        std::cout<<"No hay usuarios esperando." << std::endl;
    }
    Usuario ultimo = deptos.atenderSiguiente("bomberos");
    std::string nombre = ultimo.getNombre();
    std::string cedula = ultimo.getCedula();
    std::string telefono = ultimo.getTelefono();
    int prio = ultimo.getPrioridad();
    std::string depto = ultimo.getDepartamento();  
    
    std::cout << "el nombre del paciente atendido es :" << nombre <<" su cedula es :" << cedula << " su telefono es : " 
    << telefono << 
    " su prioridad era " << prio << " y su departamento era " << depto << std::endl;
    
    
    return 0;
}