export interface Coordenadas {
  lat: number
  lng: number
  accuracy: number | null
}

export type ErroLocalizacao = 'negado' | 'indisponivel' | 'timeout' | 'nao_suportado'

export interface ResultadoLocalizacao {
  coords?: Coordenadas
  erro?: ErroLocalizacao
}

// Leitura ÚNICA e pontual do GPS — nunca watchPosition (que ficaria
// monitorando em segundo plano). maximumAge: 0 garante que a leitura é
// sempre fresca, nunca reaproveita uma posição antiga do navegador.
export function obterLocalizacao(): Promise<ResultadoLocalizacao> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ erro: 'nao_suportado' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
          },
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ erro: 'negado' })
        else if (err.code === err.TIMEOUT) resolve({ erro: 'timeout' })
        else resolve({ erro: 'indisponivel' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}
