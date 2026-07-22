import React, { useState } from 'react';
import { Puzzle, X, Plus, ChevronDown, Activity, Timer, Shuffle, Calculator, Layers, Columns2 } from 'lucide-react';
import { WIDGET_CATALOG } from '../lib/widgetCatalog';

const ICONS = { Activity, Timer, Shuffle, Calculator, Layers, Columns2 };

function defaultValuesFor(widget) {
  const values = {};
  (widget.configFields || []).forEach((field) => {
    values[field.key] = field.default;
  });
  return values;
}

export default function WidgetLibraryDrawer({ isOpen, onClose, onInsertWidget }) {
  const [expandedId, setExpandedId] = useState(null);
  const [values, setValues] = useState({});

  if (!isOpen) return null;

  const toggleExpand = (widget) => {
    if (expandedId === widget.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(widget.id);
    setValues(defaultValuesFor(widget));
  };

  const handleFieldChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleInsert = (widget) => {
    onInsertWidget(widget.buildHtml(values));
    setExpandedId(null);
  };

  return (
    <div className="glass-panel" style={{ position: 'absolute', top: '64px', right: 0, width: '360px', height: 'calc(100vh - 64px)', zIndex: 100, borderRadius: 0, padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass-bright)', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Puzzle size={18} /> Widgets Interativos
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
        Clique num widget pra configurar e inserir no slide atual:
      </p>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {WIDGET_CATALOG.map((widget) => {
          const Icon = ICONS[widget.iconName] || Puzzle;
          const isExpanded = expandedId === widget.id;

          return (
            <div
              key={widget.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '0.5rem',
                border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                overflow: 'hidden'
              }}
            >
              <div
                style={{ padding: '0.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem', cursor: 'pointer' }}
                onClick={() => toggleExpand(widget)}
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

                <ChevronDown
                  size={16}
                  color="#6b7280"
                  style={{ flexShrink: 0, marginTop: '0.15rem', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                />
              </div>

              {isExpanded && (
                <div style={{ padding: '0 0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(widget.configFields || []).map((field) => (
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
                      ) : (
                        <input
                          className="chat-input"
                          type={field.type === 'number' ? 'number' : 'text'}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
                          value={values[field.key] ?? ''}
                          onChange={(e) => handleFieldChange(field.key, field.type === 'number' ? e.target.value : e.target.value)}
                        />
                      )}
                    </div>
                  ))}

                  <button
                    className="btn-primary"
                    style={{ justifyContent: 'center', fontSize: '0.82rem', marginTop: '0.2rem' }}
                    onClick={() => handleInsert(widget)}
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
