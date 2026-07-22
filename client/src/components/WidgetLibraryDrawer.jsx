import React, { useState } from 'react';
import {
  Puzzle, X, Plus, ChevronDown,
  Activity, Timer, Shuffle, Calculator, Layers, Columns2,
  Type, Heading1, Heading2, Heading3, Quote, Tag, Table2, List, ListOrdered, ListChecks,
  StickyNote, Info, AlertTriangle, Link2, QrCode,
  Columns3, LayoutGrid, PanelLeft, CircleDot, ArrowRight,
  BarChart3, GanttChartSquare, Network, Workflow, History, Filter, Target, CircleEllipsis, CalendarDays
} from 'lucide-react';
import { WIDGET_CATALOG } from '../lib/widgetCatalog';
import { BLOCK_CATALOG } from '../lib/blockCatalog';
import { LAYOUT_CATALOG } from '../lib/layoutCatalog';
import { DIAGRAM_CATALOG } from '../lib/diagramCatalog';

const ICONS = {
  Activity, Timer, Shuffle, Calculator, Layers, Columns2,
  Type, Heading1, Heading2, Heading3, Quote, Tag, Table2, List, ListOrdered, ListChecks,
  StickyNote, Info, AlertTriangle, Link2, QrCode,
  Columns3, LayoutGrid, PanelLeft, CircleDot, ArrowRight,
  BarChart3, GanttChartSquare, Network, Workflow, History, Filter, Target, CircleEllipsis, CalendarDays
};

const TABS = [
  { id: 'blocos', label: 'Blocos', catalog: BLOCK_CATALOG },
  { id: 'layouts', label: 'Layouts', catalog: LAYOUT_CATALOG },
  { id: 'diagramas', label: 'Diagramas', catalog: DIAGRAM_CATALOG },
  { id: 'interativos', label: 'Interativos', catalog: WIDGET_CATALOG }
];

function defaultValuesFor(item) {
  const values = {};
  (item.configFields || []).forEach((field) => {
    values[field.key] = field.default;
  });
  return values;
}

export default function WidgetLibraryDrawer({ isOpen, onClose, onInsertWidget }) {
  const [activeTabId, setActiveTabId] = useState('blocos');
  const [expandedId, setExpandedId] = useState(null);
  const [values, setValues] = useState({});

  if (!isOpen) return null;

  const activeCatalog = TABS.find((t) => t.id === activeTabId).catalog;

  const handleSelectTab = (tabId) => {
    setActiveTabId(tabId);
    setExpandedId(null);
  };

  const toggleExpand = (item) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setValues(defaultValuesFor(item));
  };

  const handleFieldChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleInsert = (item) => {
    onInsertWidget(item.buildHtml(values));
    setExpandedId(null);
  };

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '360px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Puzzle size={18} /> Inserir Conteúdo
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '0.5rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSelectTab(tab.id)}
            style={{
              flex: 1, padding: '0.4rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '0.4rem', border: 'none', cursor: 'pointer',
              background: activeTabId === tab.id ? 'var(--accent-primary)' : 'transparent',
              color: activeTabId === tab.id ? '#071019' : '#9ca3af'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
        Clique num item pra configurar e inserir no slide atual:
      </p>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeCatalog.map((item) => {
          const Icon = ICONS[item.iconName] || Puzzle;
          const isExpanded = expandedId === item.id;

          return (
            <div
              key={item.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '0.5rem',
                border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                overflow: 'hidden'
              }}
            >
              <div
                style={{ padding: '0.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem', cursor: 'pointer' }}
                onClick={() => toggleExpand(item)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', overflow: 'hidden' }}>
                  <Icon size={18} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.2rem' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>
                      {item.description}
                    </div>
                  </div>
                </div>

                <ChevronDown
                  size={16}
                  color="#6b7280"
                  style={{ flexShrink: 0, marginTop: '0.15rem', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                />
              </div>

              {isExpanded && (
                <div style={{ padding: '0 0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(item.configFields || []).map((field) => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                        {field.label}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          className="chat-input"
                          rows={3}
                          style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                          value={values[field.key] ?? ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          className="chat-input"
                          style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
                          value={values[field.key] ?? ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        >
                          {(field.options || []).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="chat-input"
                          type={field.type === 'number' ? 'number' : 'text'}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
                          value={values[field.key] ?? ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}

                  <button
                    className="btn-primary"
                    style={{ justifyContent: 'center', fontSize: '0.82rem', marginTop: '0.2rem' }}
                    onClick={() => handleInsert(item)}
                  >
                    <Plus size={15} /> Inserir no Slide
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
