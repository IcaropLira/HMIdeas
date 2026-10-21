import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode desligado de propósito: o Pixi inicializa de forma assíncrona num <canvas>,
// e o duplo mount do modo de desenvolvimento quebraria o contexto WebGL.
createRoot(document.getElementById("root")!).render(<App />);
