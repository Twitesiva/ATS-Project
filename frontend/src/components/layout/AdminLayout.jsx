import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AdminLayout({ sidebarRole = "hr" }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isToggleHovered, setIsToggleHovered] = useState(false);
  const [isToggleActive, setIsToggleActive] = useState(false);
  const sidebarWidth = 220;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        onMouseEnter={() => setIsToggleHovered(true)}
        onMouseLeave={() => {
          setIsToggleHovered(false);
          setIsToggleActive(false);
        }}
        onMouseDown={() => setIsToggleActive(true)}
        onMouseUp={() => setIsToggleActive(false)}
        onBlur={() => setIsToggleActive(false)}
        style={{
          position: "absolute",
          top: "12px",
          left: isSidebarOpen ? `${sidebarWidth - 12}px` : "12px",
          zIndex: 20,
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          border: `1px solid ${isToggleActive ? "#475569" : "#334155"}`,
          background: isToggleActive ? "#374151" : isToggleHovered ? "#1f2937" : "#111827",
          color: "#e5e7eb",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 700,
          lineHeight: 1,
          transition: "left 0.25s ease, background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease",
          boxShadow: isToggleHovered ? "0 2px 6px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.2)",
          transform: isToggleActive ? "scale(0.96)" : "scale(1)",
        }}
        aria-label={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        {isSidebarOpen ? "<" : ">"}
      </button>

      <div
        style={{
          width: isSidebarOpen ? `${sidebarWidth}px` : "0px",
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: isSidebarOpen ? `${sidebarWidth}px` : "0px",
          height: "100vh",
          background: "#111827",
          overflowY: isSidebarOpen ? "auto" : "hidden",
          overflowX: "hidden",
          transform: isSidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "width 0.25s ease, flex-basis 0.25s ease, transform 0.25s ease",
        }}
      >
        <Sidebar role={sidebarRole} />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          padding: "20px",
          background: "#f3f4f6",
          overflowX: "auto",
          overflowY: "auto",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
