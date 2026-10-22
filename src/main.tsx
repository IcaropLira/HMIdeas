import { createRoot } from "react-dom/client";
import App from "./App";
import { initCustomBrushes } from "./core/brushPresets";
import "./styles.css";

// StrictMode desligado de propósito: o Pixi inicializa de forma assíncrona num <canvas>,
// e o duplo mount do modo de desenvolvimento quebraria o contexto WebGL.
// Pincéis do usuário precisam estar registrados ANTES do primeiro traço/painel (senão o brush salvo cai na caneta).
initCustomBrushes();

createRoot(document.getElementById("root")!).render(<App />);
