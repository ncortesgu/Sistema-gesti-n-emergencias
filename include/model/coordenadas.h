#ifndef COORDENADAS_H
#define COORDENADAS_H

#include <string>

class coordenadas {

private:

    int X;
    int Y;

public:

    // Constructores
    coordenadas();
    coordenadas(int X, int Y);

    // Getters
    int getX() const;
    int getY() const;

    // Setters
    void setX(int X);
    void setY(int Y);

};

#endif // COORDENADAS_H