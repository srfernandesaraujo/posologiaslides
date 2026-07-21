import React from 'react';
import { Puzzle, X, Plus, Activity, Timer, Shuffle } from 'lucide-react';
import { WIDGET_CATALOG } from '../lib/widgetCatalog';

const ICONS = { Activity, Timer, Shuffle };

export default function WidgetLibraryDrawer({ isOpen, onClose, onInsertWidget }) {
  if (!isOpen) return null;

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '340px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Puzzle size={18} /> Widgets Interativos
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
        Clique no widget desejado para inseri-lo diretamente no slide atual:
      </p>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {WIDGET_CATALOG.map((widget) => {
          const Icon = ICONS[widget.iconName] || Puzzle;
          return (
            <div
              key={widget.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.6rem',
                cursor: 'pointer'
              }}
              onClick={() => onInsertWidget(widget.buildHtml())}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', overflow: 'hidden' }}>
                <Icon size={18} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.2rem' }}>
                    {widget.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>
                    {widget.description}
                  </div>
                </div>
              </div>

              <button className="btn-icon" style={{ width: '26px', height: '26px', flexShrink: 0 }}>
                <Plus size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
