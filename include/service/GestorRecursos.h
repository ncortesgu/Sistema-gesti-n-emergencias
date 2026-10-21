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
        void eliminarUnidad(const std::string& departamento, const std::string& id);


        // Métodos para asignar y liberar unidades
        bool asignarUnidad( Usuario& usuario);
        void liberarUnidad(std::string& idUnidad);

        // Métodos para consultar el estado de las unidades
        int unidadesDisponibles(const std::string& departamento) const;
        void infoUnidad(const std::string& departamento, const std::string& idUnidad) const;
        
        //Unidad obtenerUnidad(std::string nombreDepartamento, Unidad unidad);
        void avanzarTiempo(double minutos); // Método para simular la atención de un usuario, actualizando el estado de la unidad y el tiempo de resolución

};

#endif // GESTOR_RECURSOS_H