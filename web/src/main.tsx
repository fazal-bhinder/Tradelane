import "./index.css";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { api, ApiError } from "./api";
import { AnalystProvider } from "./components/Analyst";
import { Mark, Shell } from "./components/Shell";
import { ToastProvider } from "./components/Toast";
import ActivityPage from "./pages/Activity";
import ImportPage from "./pages/Import";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import ProductPage from "./pages/Product";
import ReviewPage from "./pages/Review";
import RulesPage from "./pages/Rules";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 1 },
  },
});

function App() {
  const location = useLocation();
  const { data: me, isLoading, error } = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (isLoading) {
    return <div className="grid min-h-dvh place-items-center"><Mark size={32} /></div>;
  }
  if (!me || (error instanceof ApiError && error.status === 401)) return <Login />;
  return (
    <AnalystProvider>
      <Shell me={me}>
        <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
        <Routes location={location}>
          <Route path="/" element={<Overview me={me} />} />
          <Route path="/products/:id" element={<ProductPage me={me} />} />
          <Route path="/review" element={<ReviewPage me={me} />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="*" element={<p className="text-ink-2">That page does not exist. <a className="text-indigo" href="/">Go to the catalogue</a>.</p>} />
        </Routes>
        </motion.div>
        </AnimatePresence>
      </Shell>
    </AnalystProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
