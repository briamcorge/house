import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Properties from "./pages/Properties";
import RoomList from "./pages/RoomList";
import RoomDetail from "./pages/RoomDetail";
import Bills from "./pages/Bills";
import Tenants from "./pages/Tenants";
import More from "./pages/More";
import Contracts from "./pages/Contracts";
import Trash from "./pages/Trash";
import Statistics from "./pages/Statistics";
import BottomNav from "./components/BottomNav";
import AuthModal from "./components/AuthModal";
import { AlertTriangle, X } from "lucide-react";
import { initSync, hasToken } from "./lib/cloud-sync";
import { useStore } from "./store/useStore";
import { supabase, isSupabaseConfigured, loadCloudData, saveCloudData } from "./lib/supabase";

const STORAGE_KEY = "property-manager-data"
const MAX_STORAGE_BYTES = 5 * 1024 * 1024
const WARN_THRESHOLD = 0.8

function StorageWarning() {
  const [dismissed, setDismissed] = useState(false)
  const [usage, setUsage] = useState(0)

  const checkStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const bytes = new Blob([raw]).size
      setUsage(bytes)
    } catch {
      // localStorage might be full or unavailable
    }
  }, [])

  useEffect(() => {
    checkStorage()
    const interval = setInterval(checkStorage, 30000)
    return () => clearInterval(interval)
  }, [checkStorage])

  if (dismissed) return null

  const ratio = usage / MAX_STORAGE_BYTES
  if (ratio < WARN_THRESHOLD) return null

  const pct = Math.round(ratio * 100)
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-2">
      <div className="max-w-md mx-auto flex items-start gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
        <p className="flex-1 text-yellow-800">
          存储空间使用率 {pct}%（约 {(usage / 1024 / 1024).toFixed(1)}MB / {MAX_STORAGE_BYTES / 1024 / 1024}MB），
          建议 <span className="font-medium">更多 → 数据备份 → 导出Excel</span> 备份后清除旧数据
        </p>
        <button type="button" onClick={() => setDismissed(true)} className="text-yellow-500 hover:text-yellow-700 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [showAuth, setShowAuth] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const syncTimer = useRef<any>(null)

  // GitHub token sync (backward compat - removed when Supabase fully replaces it)
  useEffect(() => {
    if (hasToken()) {
      initSync((merged) => {
        useStore.setState(merged as any)
      })
    }
  }, [])

  // Supabase auth + sync
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthReady(true)
      return
    }

    // Listen for "open-auth" event from More.tsx
    const openAuthHandler = () => setShowAuth(true)
    window.addEventListener('open-auth', openAuthHandler)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null

      if (event === 'INITIAL_SESSION') {
        setAuthReady(true)
      }

      if (user) {
        setShowAuth(false)
        // Load cloud data into local store (once on login/startup)
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          const cloudData = await loadCloudData()
          if (cloudData) {
            useStore.setState({
              properties: cloudData.properties,
              rooms: cloudData.rooms,
              tenants: cloudData.tenants,
              bills: cloudData.bills,
              landlordContracts: cloudData.landlordContracts,
              profitRecords: cloudData.profitRecords,
              trash: cloudData.trash,
            } as any)
          }
        }
      } else {
        // Not logged in - show auth modal (after initial session check)
        if (event === 'INITIAL_SESSION') {
          setShowAuth(true)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('open-auth', openAuthHandler)
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  // Auto-save store changes to Supabase (debounced)
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    // Wait until auth is resolved before subscribing
    if (!authReady) return

    const unsub = useStore.subscribe((state) => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => {
        saveCloudData({
          properties: state.properties,
          rooms: state.rooms,
          tenants: state.tenants,
          bills: state.bills,
          landlordContracts: state.landlordContracts,
          profitRecords: state.profitRecords,
          trash: state.trash,
        })
      }, 3000)
    })

    return () => {
      unsub()
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [authReady])

  return (
    <Router basename="/house">
      <div className="min-h-screen">
        <StorageWarning />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:propertyId" element={<RoomList />} />
          <Route path="/properties/:propertyId/rooms/:roomId" element={<RoomDetail />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/more" element={<More />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/statistics" element={<Statistics />} />
        </Routes>
        <BottomNav />
        <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
      </div>
    </Router>
  );
}
