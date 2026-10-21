#ifndef GRABADOR_AUDIO_H
#define GRABADOR_AUDIO_H

#include <string>
#include <vector>

class GrabadorAudio {
public:
    static bool grabarWav(const std::string &ruta, int segundos, std::string &error);
    static std::vector<std::string> listarDispositivos();
};

#endif // GRABADOR_AUDIO_H
