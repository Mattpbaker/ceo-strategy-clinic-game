"use client";

import { Radio, X } from "lucide-react";
import { ReactNode, useEffect } from "react";

interface MessageCenterTab {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

interface MessageCenterDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  tabs: MessageCenterTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onClose: () => void;
  footer?: ReactNode;
}

export function MessageCenterDrawer({
  open,
  title,
  subtitle,
  tabs,
  activeTabId,
  onTabChange,
  onClose,
  footer
}: MessageCenterDrawerProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label={title}>
      <button className="drawer-overlay" onClick={onClose} aria-label="Close message center" />
      <aside className="drawer-panel">
        <header className="drawer-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Radio size={16} color="var(--accent)" />
            <div>
              <h2>Intel Center</h2>
              {subtitle ? <p className="small">{subtitle}</p> : null}
            </div>
          </div>
          <button className="secondary" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.4rem 0.7rem" }}>
            <X size={14} />
            Close
          </button>
        </header>

        <nav className="drawer-tabs" aria-label="Message center tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`drawer-tab ${tab.id === activeTab?.id ? "active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
            </button>
          ))}
        </nav>

        <section className="drawer-content">{activeTab?.content}</section>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
