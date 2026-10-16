import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GmApp } from './gm/GmApp';
import { PlayerApp } from './player/PlayerApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/gm" element={<GmApp />} />
        <Route path="*" element={<PlayerApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
