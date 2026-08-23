# Ruleta del Trago 🍻🎰

Juego de fiesta multijugador en tiempo real. Ruleta + retos + tragos adaptados al nivel de borrachera de cada uno.

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

Opciones recomendadas (gratis/barato):

1. **Render** — Web Service, build: `npm install && npm run build`, start: `npm start`
2. **Railway** — igual
3. **Fly.io** — con Dockerfile

Tras desplegar, comparte la URL. Los amigos abren `/join` o entran el código en lobby.

### Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (default 3000) |
| `VITE_SOCKET_URL` | URL del backend en build (vacío = mismo origen) |

## Flujo del juego

1. **Host** crea sala → configura vibes, tipos de reto, orientación, strip
2. **Amigos** unen con código (nombre + nivel borracho 1–10 + si beben)
3. Host inicia → pausa inicial de niveles
4. Host gira ruleta → reto adaptado por jugador
5. Pausas de borrachera cada 4 rondas
6. Objetivo: 7.5–8.5 en todos sin pasarse

## Stack

- React + Vite + TypeScript
- Express + Socket.io
- 150 retos iniciales en español + editor host para custom

## Licencia

Uso personal. Sin ads. Sin stores.
