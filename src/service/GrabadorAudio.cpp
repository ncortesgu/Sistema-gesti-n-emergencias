#include "../../include/service/GrabadorAudio.h"

#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

#include <chrono>
#include <cstdint>
#include <fstream>
#include <thread>
#include <vector>

namespace {

struct Captura {
    std::vector<ma_int16> muestras;
};

void callbackCaptura(ma_device *dispositivo, void *, const void *entrada,
                     ma_uint32 cantidadFrames) {
    if (entrada == nullptr || dispositivo->pUserData == nullptr) {
        return;
    }
    auto *captura = static_cast<Captura *>(dispositivo->pUserData);
    const auto *muestras = static_cast<const ma_int16 *>(entrada);
    const std::size_t total = static_cast<std::size_t>(cantidadFrames) *
                              dispositivo->capture.channels;
    captura->muestras.insert(captura->muestras.end(), muestras, muestras + total);
}

void escribirUint16(std::ofstream &archivo, std::uint16_t valor) {
    const char bytes[2] = {
        static_cast<char>(valor & 0xFF),
        static_cast<char>((valor >> 8) & 0xFF),
    };
    archivo.write(bytes, 2);
}

void escribirUint32(std::ofstream &archivo, std::uint32_t valor) {
    const char bytes[4] = {
        static_cast<char>(valor & 0xFF),
        static_cast<char>((valor >> 8) & 0xFF),
        static_cast<char>((valor >> 16) & 0xFF),
        static_cast<char>((valor >> 24) & 0xFF),
    };
    archivo.write(bytes, 4);
}

bool escribirWav(const std::string &ruta, const std::vector<ma_int16> &muestras,
                 std::uint32_t frecuencia, std::uint16_t canales, std::string &error) {
    std::ofstream archivo(ruta, std::ios::binary);
    if (!archivo) {
        error = "No se pudo crear el archivo WAV: " + ruta;
        return false;
    }

    const std::uint32_t bytesDatos =
        static_cast<std::uint32_t>(muestras.size() * sizeof(ma_int16));
    const std::uint16_t bitsPorMuestra = 16;
    const std::uint16_t bloqueAlineacion =
        static_cast<std::uint16_t>(canales * bitsPorMuestra / 8);
    const std::uint32_t bytesPorSegundo = frecuencia * bloqueAlineacion;

    archivo.write("RIFF", 4);
    escribirUint32(archivo, 36 + bytesDatos);
    archivo.write("WAVE", 4);
    archivo.write("fmt ", 4);
    escribirUint32(archivo, 16);
    escribirUint16(archivo, 1);
    escribirUint16(archivo, canales);
    escribirUint32(archivo, frecuencia);
    escribirUint32(archivo, bytesPorSegundo);
    escribirUint16(archivo, bloqueAlineacion);
    escribirUint16(archivo, bitsPorMuestra);
    archivo.write("data", 4);
    escribirUint32(archivo, bytesDatos);
    archivo.write(reinterpret_cast<const char *>(muestras.data()),
                  static_cast<std::streamsize>(bytesDatos));
    if (!archivo) {
        error = "No se pudo escribir el archivo WAV: " + ruta;
        return false;
    }
    return true;
}

} // namespace

bool GrabadorAudio::grabarWav(const std::string &ruta, int segundos, std::string &error) {
    if (segundos <= 0 || segundos > 30) {
        error = "La duración debe estar entre 1 y 30 segundos.";
        return false;
    }

    ma_device_config configuracion = ma_device_config_init(ma_device_type_capture);
    configuracion.capture.format = ma_format_s16;
    configuracion.capture.channels = 1;
    configuracion.sampleRate = 16000;

    Captura captura;
    configuracion.pUserData = &captura;
    configuracion.dataCallback = callbackCaptura;

    ma_device dispositivo;
    const ma_result resultado = ma_device_init(nullptr, &configuracion, &dispositivo);
    if (resultado != MA_SUCCESS) {
        error = std::string("No se pudo abrir el micrófono: ") +
                ma_result_description(resultado);
        return false;
    }

    if (ma_device_start(&dispositivo) != MA_SUCCESS) {
        ma_device_uninit(&dispositivo);
        error = "No se pudo iniciar la grabación del micrófono.";
        return false;
    }

    std::this_thread::sleep_for(std::chrono::seconds(segundos));
    ma_device_stop(&dispositivo);
    ma_device_uninit(&dispositivo);

    if (captura.muestras.empty()) {
        error = "No se capturó audio del micrófono.";
        return false;
    }

    return escribirWav(ruta, captura.muestras, 16000, 1, error);
}

std::vector<std::string> GrabadorAudio::listarDispositivos() {
    std::vector<std::string> dispositivos;
    ma_context contexto;
    if (ma_context_init(nullptr, 0, nullptr, &contexto) != MA_SUCCESS) {
        return dispositivos;
    }

    ma_device_info *dispositivosCaptura = nullptr;
    ma_uint32 cantidad = 0;
    if (ma_context_get_devices(&contexto, nullptr, nullptr, &dispositivosCaptura,
                               &cantidad) == MA_SUCCESS) {
        for (ma_uint32 i = 0; i < cantidad; ++i) {
            dispositivos.emplace_back(dispositivosCaptura[i].name);
        }
    }

    ma_context_uninit(&contexto);
    return dispositivos;
}
