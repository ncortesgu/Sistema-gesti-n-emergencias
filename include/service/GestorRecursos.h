#ifndef GESTOR_RECURSOS_H
#define GESTOR_RECURSOS_H

#include <algorithm>
#include <map>
#include <queue>
#include <string>
#include <vector>
#include "model/unidad.h"
#include "model/usuario.h"


enum class EstadoAtencion {
    EnCamino,
    Atendiendo
};

struct UnidadVista {
    std::string departamento;
    std::string id;
    int x;
    int y;
    double efectividad;
    double velocidad;
    bool asignada;
};

class GestorRecursos {
    private:
        // Mapa que asocia un departamento las unidades asociadas a este.
        struct AtencionActiva {
            std::string idUsuario;
            std::string idUnidad;

            double tiempoLlegadaRestante;
            double tiempoAtencionRestante;

            EstadoAtencion estado;
        };
        std::map<std::string, std::vector<Unidad>> recursos;
        std::vector<AtencionActiva> atencionesActivas; // Vector que almacena las atenciones activas

    public:
        // Constructor
        GestorRecursos();

        // Métodos principales


        void registrarUnidad(std::string departamento, std::string id, double efectividad, double velocidad);
        void registrarUnidad(std::string departamento, std::string id, double efectividad,
                             double velocidad, const coordenadas &ubicacion);
        void eliminarUnidad(const std::string& departamento, const std::string& id);


        // Métodos para asignar y liberar unidades
        bool asignarUnidad( Usuario& usuario);
        bool asignarUnidad(Usuario& usuario, std::string& idUnidad);
        bool liberarUnidad(std::string& idUnidad);

        // MǸtodos para consultar el estado de las unidades
        int unidadesDisponibles(const std::string& departamento) const;
        std::vector<UnidadVista> listarUnidades() const;
        void infoUnidad(const std::string& departamento, const std::string& idUnidad) const;
        
        //Unidad obtenerUnidad(std::string nombreDepartamento, Unidad unidad);
        void avanzarTiempo(double minutos); // Método para simular la atención de un usuario, actualizando el estado de la unidad y el tiempo de resolución

};

#endif // GESTOR_RECURSOS_H