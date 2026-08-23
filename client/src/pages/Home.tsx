import { Link, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { sounds } from "../utils/sounds";
import { BIRTHDAY_NAME } from "../constants/birthday";

export default function Home() {
  const navigate = useNavigate();
  const { createRoom, connected, socket } = useSocket();

  const handleCreate = async () => {
    sounds.click();
    try {
      if (!socket) throw new Error("Sin conexión. Recarga la página.");
      if (!socket.connected) {
        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(
            () => reject(new Error("El servidor tarda. Recarga e inténtalo.")),
            15000
          );
          socket.once("connect", () => {
            window.clearTimeout(t);
            resolve();
          });
        });
      }
      const room = await createRoom();
      navigate(`/host/setup?code=${room.code}`);
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Error al crear sala. ¿Servidor encendido?"
      );
    }
  };

  return (
    <div>
      <div className="logo-emoji">🍻🎰🎂</div>
      <h1>Ruleta del Trago</h1>
      <p className="birthday-home-tagline">
        Edición cumple de {BIRTHDAY_NAME}: globos, confeti y brindis extra.
      </p>
      <p className="muted" style={{ marginBottom: 24 }}>
        La ruleta elige a una persona. Tú cumples. El grupo juzga. Objetivo:
        zona 7.5–8.5. Meme mode activado.
      </p>

      <div className="card" style={{ marginBottom: 16, borderColor: "var(--cyan)" }}>
        <p className="muted" style={{ margin: 0 }}>
          🌐 Juego online:{" "}
          <a
            href="https://ruleta-del-trago.onrender.com"
            style={{ color: "var(--cyan)" }}
          >
            ruleta-del-trago.onrender.com
          </a>
        </p>
      </div>

      {!connected && (
        <div className="alert-banner alert-warning">
          Conectando al servidor… Si tarda, arranca con <code>npm run dev</code>
        </div>
      )}

      <button className="btn btn-primary" onClick={handleCreate}>
        Crear sala (soy host)
      </button>

      <Link
        to="/join"
        className="btn btn-secondary"
        style={{ marginTop: 12 }}
        onClick={() => sounds.click()}
      >
        Unirse con código
      </Link>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>¿Cómo funciona?</h3>
        <p className="muted">
          1. Host configura vibes y retos · 2. Amigos entran con código · 3. Gira
          la ruleta · 4. Reto o trago adaptado a tu nivel · 5. Profit (o
          descontrol)
        </p>
      </div>
    </div>
  );
}
