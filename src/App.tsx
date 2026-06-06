import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Properties from "./pages/Properties";
import RoomList from "./pages/RoomList";
import RoomDetail from "./pages/RoomDetail";
import Bills from "./pages/Bills";
import Tenants from "./pages/Tenants";
import More from "./pages/More";
import Contracts from "./pages/Contracts";
import BottomNav from "./components/BottomNav";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:propertyId" element={<RoomList />} />
          <Route path="/properties/:propertyId/rooms/:roomId" element={<RoomDetail />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/more" element={<More />} />
          <Route path="/contracts" element={<Contracts />} />
        </Routes>
        <BottomNav />
      </div>
    </Router>
  );
}
