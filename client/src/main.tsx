import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GmApp } from './gm/GmApp';
import { PlayerApp } from './player/PlayerApp';
import { Recover } from './Recover';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/gm"
          element={
            <Recover title="Console error" body="A panel failed to draw. Retrying in a few seconds; reload if it persists. The game keeps running.">
              <GmApp />
            </Recover>
          }
        />
        <Route
          path="*"
          element={
            <Recover title="Signal interrupted" body="The terminal dropped a frame. Re-establishing the link.">
              <PlayerApp />
            </Recover>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
