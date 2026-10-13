import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Home from './pages/Home.jsx';
import NewBottle from './pages/NewBottle.jsx';
import Bottles from './pages/Bottles.jsx';
import BottleView from './pages/BottleView.jsx';
import OpenBottle from './pages/OpenBottle.jsx';
import Find from './pages/Find.jsx';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
          <Route path="/create" element={<NewBottle />} />
          <Route path="/bottles" element={<Bottles />} />
          <Route path="/b/:id" element={<BottleView />} />
          <Route path="/open/:token" element={<OpenBottle />} />
          <Route path="/find" element={<Find />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
