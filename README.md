# Ruleta del Trago 🍻🎰

Juego de fiesta multijugador en tiempo real. Ruleta + retos + tragos adaptados al nivel de cada persona.

## Requisitos

- Node.js 18+

## Desarrollo local

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend (Socket.io): http://localhost:3000

## Producción

```bash
npm install
npm run build
npm start
```

Sirve en `PORT` (default 3000). Un solo proceso: API + WebSockets + estáticos.

## Despliegue web (para que jueguen tus amigos)

### Opción A — Render (permanente, gratis)

1. Abre: https://render.com/deploy?repo=https://github.com/alkalo/ruleta-del-trago
2. Conecta GitHub y crea el servicio (plan Free).
3. Tu URL será algo como `https://ruleta-del-trago.onrender.com`

El `render.yaml` ya está configurado con Docker + health check.

### Opción B — Túnel Cloudflare (rápido, desde tu PC)

```powershell
.\scripts\start-cloud.ps1
```

Genera una URL pública `https://xxx.trycloudflare.com` mientras tu PC esté encendido.

### Opción C — Docker local / VPS

```bash
docker compose up --build
```


### Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (default 3000) |
| `VITE_SOCKET_URL` | URL del backend en build (vacío = mismo origen) |

## Flujo del juego

1. **Host** crea sala → configura vibes, tipos de reto, orientación, strip
2. **Amigos** unen con código (nombre + género + nivel 1–10 + si beben)
3. Host inicia → pausa inicial de niveles
4. Host gira ruleta → reto adaptado por jugador (pareja según géneros de la sala)
5. Pausas de copas cada 4 rondas
6. Objetivo: 7.5–8.5 en todos sin pasarse

## Stack

- React + Vite + TypeScript
- Express + Socket.io
- 150 retos iniciales en español (pack del servidor)

## Licencia

Uso personal. Sin ads. Sin stores.
