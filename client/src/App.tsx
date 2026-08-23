import { Routes, Route } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import BirthdayDecor, { BirthdayBanner } from "./components/BirthdayDecor";
import Home from "./pages/Home";
import HostSetup from "./pages/HostSetup";
import Join from "./pages/Join";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";

export default function App() {
  return (
    <SocketProvider>
      <BirthdayDecor />
      <div className="app-shell">
        <BirthdayBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/setup" element={<HostSetup />} />
          <Route path="/join" element={<Join />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/game/:code" element={<Game />} />
        </Routes>
      </div>
    </SocketProvider>
  );
}
