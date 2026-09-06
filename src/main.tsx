import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Оффлайн и установка на телефон; в дев-режиме воркер только мешает
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = [
          ...document.querySelectorAll<HTMLScriptElement>('script[src]'),
        ]
          .map((el) => el.src)
          .concat(
            [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
              (el) => el.href,
            ),
          )
        registration.active?.postMessage({ type: 'cache', urls })
      })
      .catch(() => {
        // без воркера приложение работает как обычная страница
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
