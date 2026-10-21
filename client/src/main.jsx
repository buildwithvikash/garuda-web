import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Start from './pages/Start.jsx';
import NotMigrated from './pages/NotMigrated.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/start" replace />} />
          <Route path="/start" element={<Start />} />
          {/* Further migrated module routes go here. */}
          <Route path="*" element={<NotMigrated />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
