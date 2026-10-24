import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import Login from '@/pages/auth/Login.jsx';
import ChangePassword from '@/pages/auth/ChangePassword.jsx';
import AppLayout from '@/layouts/AppLayout.jsx';
import Start from '@/pages/home/index.jsx';
import ScreenRouter from '@/routes/ScreenRouter.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/start" replace />} />
          <Route path="/start" element={<Start />} />
          <Route path="*" element={<ScreenRouter />} />
        </Route>
      </Routes>
    </BrowserRouter>
    <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontSize: '14px' } }} />
  </StrictMode>,
);
