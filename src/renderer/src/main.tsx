import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app/App"
import "./index.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error('Missing root element with id"root"')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
