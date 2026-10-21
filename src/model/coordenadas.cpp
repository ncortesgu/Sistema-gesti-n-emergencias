#include "model/coordenadas.h"

// Constructor por defecto
coordenadas::coordenadas() : X(0), Y(0) {}

// Constructor parametrizado
coordenadas::coordenadas(int X, int Y) : X(X), Y(Y) {}

// Getters
int coordenadas::getX() const { return X; }
int coordenadas::getY() const { return Y; }

// Setters
void coordenadas::setX(int X) { this->X = X; }
void coordenadas::setY(int Y) { this->Y = Y; }