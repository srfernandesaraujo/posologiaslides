import React, { useState, useEffect } from 'react';
import {
  Puzzle, X, Plus, Save, ChevronDown, Sparkles, Loader2, Search,
  Activity, Timer, Shuffle, Calculator, Layers, Columns2,
  Type, Heading1, Heading2, Heading3, Quote, Tag, Table2, List, ListOrdered, ListChecks,
  StickyNote, Info, AlertTriangle, Link2, QrCode,
  Columns3, LayoutGrid, PanelLeft, CircleDot, ArrowRight,
  BarChart3, GanttChartSquare, Network, Workflow, History, Filter, Target, CircleEllipsis, CalendarDays
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { WIDGET_CATALOG } from '../lib/widgetCatalog';
import { BLOCK_CATALOG } from '../lib/blockCatalog';
import { LAYOUT_CATALOG } from '../lib/layoutCatalog';
import { DIAGRAM_CATALOG } from '../lib/diagramCatalog';
import { ICON_GROUPS, getIconComponent, buildIconHtml } from '../lib/iconCatalog';

const ICONS = {
  Activity, Timer, Shuffle, Calculator, Layers, Columns2,
  Type, Heading1, Heading2, Heading3, Quote, Tag, Table2, List, ListOrdered, ListChecks,
  StickyNote, Info, AlertTriangle, Link2, QrCode,
  Columns3, LayoutGrid, PanelLeft, CircleDot, ArrowRight,
  BarChart3, GanttChartSquare, Network, Workflow, History, Filter, Target, CircleEllipsis, CalendarDays,
  Sparkles
};

const TABS = [
  { id: 'blocos', label: 'Blocos', catalog: BLOCK_CATALOG },
  { id: 'layouts', label: 'Layouts', catalog: LAYOUT_CATALOG },
  { id: 'diagramas', label: 'Diagramas', catalog: DIAGRAM_CATALOG },
  { id: 'icones', label: 'Ícones', catalog: null },
  { id: 'interativos', label: 'Interativos', catalog: WIDGET_CATALOG }
];

function defaultValuesFor(item) {
  const values = {};
  (item.configFields || []).forEach((field) => {
    values[field.key] = field.default;
  });
  return values;
}

export default function WidgetLibraryDrawer({ isOpen, onClose, onInsertWidget, editingContext, onUpdateElement }) {
  const [activeTabId, setActiveTabId] = useState('blocos');
  const [expandedId, setExpandedId] = useState(null);
  const [values, setValues] = useState({});

  // Fluxo "Gerar com IA" (ex.: infográfico) — assíncrono, por isso não cabe
  // no formulário síncrono genérico de configFields + buildHtml.
  const [aiTopic, setAiTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiWarning, setAiWarning] = useState('');
  const [aiResultHtml, setAiResultHtml] = useState(null);

  // Aba de ícones
  const [iconSearch, setIconSearch] = useState('');
  const [iconColor, setIconColor] = useState('#22d3ee');
  const [iconSize, setIconSize] = useState(48);
  // Ícone já inserido no slide, sendo reconfigurado (cor/tamanho) em vez de
  // inserir um novo — ver `editingContext`.
  const [editingIcon, setEditingIcon] = useState(null);

  // Pré-carrega o item/valores (ou o ícone) que geraram o elemento selecionado
  // no slide, pra editar os campos sem precisar apagar e reinserir do zero.
  useEffect(() => {
    if (!editingContext) return;

    if (editingContext.source.startsWith('icon:')) {
      setActiveTabId('icones');
      setEditingIcon({ name: editingContext.source.slice('icon:'.length), index: editingContext.index });
      setIconColor(editingContext.config.color || '#22d3ee');
      setIconSize(editingContext.config.size || 48);
      return;
    }

    const [tabId, itemId] = editingContext.source.split(':');
    const tab = TABS.find((t) => t.id === tabId);
    const item = tab?.catalog?.find((i) => i.id === itemId);
    if (!tab || !item) return;
    setActiveTabId(tabId);
    setExpandedId(itemId);
    setValues(editingContext.config || {});
  }, [editingContext]);

  if (!isOpen) return null;

  const activeTab = TABS.find((t) => t.id === activeTabId);
  const activeCatalog = activeTab.catalog;

  const resetAiState = () => {
    setAiTopic('');
    setAiLoading(false);
    setAiError('');
    setAiWarning('');
    setAiResultHtml(null);
  };

  const handleSelectTab = (tabId) => {
    setActiveTabId(tabId);
    setExpandedId(null);
    setEditingIcon(null);
    resetAiState();
  };

  const toggleExpand = (item) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    resetAiState();
    if (item.kind !== 'ai-generate') {
      setValues(defaultValuesFor(item));
    }
  };

  const handleFieldChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleInsert = (item) => {
    onInsertWidget(item.buildHtml(values), { source: `${activeTabId}:${item.id}`, config: values });
    setExpandedId(null);
  };

  const handleSaveEdit = (item) => {
    onUpdateElement(editingContext.index, item.buildHtml(values));
    setExpandedId(null);
  };

  const handleSaveIconEdit = () => {
    if (!editingIcon) return;
    onUpdateElement(editingIcon.index, buildIconHtml({ icon: editingIcon.name, color: iconColor, size: iconSize }));
    setEditingIcon(null);
  };

  const handleGenerateAi = async (item) => {
    if (!aiTopic.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    setAiWarning('');
    setAiResultHtml(null);

    try {
      const res = await apiFetch(item.aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao gerar com IA.');
      setAiResultHtml(data.html);
      if (data.warning) setAiWarning(data.warning);
    } catch (err) {
      setAiError(err.message || 'Falha ao gerar com IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleInsertAiResult = () => {
    if (!aiResultHtml) return;
    onInsertWidget(aiResultHtml);
    setExpandedId(null);
    resetAiState();
  };

  const filteredIconGroups = ICON_GROUPS
    .map((group) => ({ ...group, icons: group.icons.filter((name) => name.toLowerCase().includes(iconSearch.trim().toLowerCase())) }))
    .filter((group) => group.icons.length > 0);

  return (
    <div className="glass-panel side-drawer-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.95)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Puzzle size={18} /> Inserir Conteúdo
        </h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSelectTab(tab.id)}
            style={{
              flex: '1 1 30%', padding: '0.4rem', fontSize: '0.72rem', fontWeight: 700, borderRadius: '0.4rem', border: 'none', cursor: 'pointer',
              background: activeTabId === tab.id ? 'var(--accent-primary)' : 'transparent',
              color: activeTabId === tab.id ? '#071019' : '#9ca3af'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTabId === 'icones' ? (
        <>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} color="#6b7280" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                className="chat-input"
                placeholder="Buscar ícone..."
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box', paddingLeft: '1.9rem' }}
              />
            </div>
            <input
              type="color"
              value={iconColor}
              onChange={(e) => setIconColor(e.target.value)}
              title="Cor do ícone"
              style={{ width: '2.4rem', height: '2.2rem', padding: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.4rem', background: 'none', cursor: 'pointer' }}
            />
            <input
              type="number"
              className="chat-input"
              value={iconSize}
              min={16}
              max={160}
              step={4}
              onChange={(e) => setIconSize(e.target.value)}
              title="Tamanho (px)"
              style={{ fontSize: '0.8rem', width: '4.2rem', boxSizing: 'border-box' }}
            />
          </div>
          {editingIcon ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--accent-primary)', borderRadius: '0.6rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center' }}>Editando o ícone já inserido — ajuste cor/tamanho acima e salve.</div>
              {(() => {
                const IconComp = getIconComponent(editingIcon.name);
                return <IconComp size={Number(iconSize)} color={iconColor} />;
              })()}
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <button className="btn-icon" style={{ width: 'auto', flex: 1 }} onClick={() => setEditingIcon(null)}>Cancelar</button>
                <button className="btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem' }} onClick={handleSaveIconEdit}>
                  <Save size={15} /> Salvar Alterações
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                Clique num ícone pra inserir direto no slide atual, na cor e tamanho escolhidos:
              </p>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredIconGroups.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', marginTop: '2rem' }}>Nenhum ícone encontrado.</p>
                )}
                {filteredIconGroups.map((group) => (
                  <div key={group.label} style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
                      {group.icons.map((name) => {
                        const IconComp = getIconComponent(name);
                        return (
                          <button
                            key={name}
                            title={name}
                            onClick={() => onInsertWidget(
                              buildIconHtml({ icon: name, color: iconColor, size: iconSize }),
                              { source: `icon:${name}`, config: { icon: name, color: iconColor, size: iconSize } }
                            )}
                            style={{
                              aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.4rem', cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                          >
                            <IconComp size={18} color={iconColor} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
            Clique num item pra configurar e inserir no slide atual:
          </p>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeCatalog.map((item) => {
              const Icon = ICONS[item.iconName] || Puzzle;
              const isExpanded = expandedId === item.id;
              const isAiItem = item.kind === 'ai-generate';
              const isEditingThisItem = editingContext?.source === `${activeTabId}:${item.id}`;

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.5rem',
                    border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                    overflow: 'hidden',
                    // Item flex com overflow != visible tem seu tamanho mínimo automático
                    // resolvido pra 0 (não pro tamanho do conteúdo) — sem isso, listas mais
                    // longas que o espaço visível (Blocos, Layouts, Diagramas) faziam o
                    // flexbox ESPREMER todos os cards em vez de deixar a lista rolar.
                    flexShrink: 0
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

                  {isExpanded && isAiItem && (
                    <div style={{ padding: '0 0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                          {item.aiInputLabel}
                        </label>
                        <textarea
                          className="chat-input"
                          rows={2}
                          placeholder={item.aiInputPlaceholder}
                          style={{ fontSize: '0.8rem', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                          value={aiTopic}
                          onChange={(e) => setAiTopic(e.target.value)}
                        />
                      </div>

                      <button
                        className="btn-primary"
                        style={{ justifyContent: 'center', fontSize: '0.82rem' }}
                        onClick={() => handleGenerateAi(item)}
                        disabled={aiLoading || !aiTopic.trim()}
                      >
                        {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                        {aiLoading ? 'Gerando...' : 'Gerar com IA'}
                      </button>

                      {aiError && (
                        <div style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '0.5rem 0.6rem', borderRadius: '0.4rem' }}>
                          {aiError}
                        </div>
                      )}
                      {aiWarning && (
                        <div style={{ fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '0.5rem 0.6rem', borderRadius: '0.4rem' }}>
                          {aiWarning}
                        </div>
                      )}

                      {aiResultHtml && (
                        <>
                          <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Pré-visualização:</div>
                          <iframe
                            title="Pré-visualização do infográfico"
                            sandbox=""
                            srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:0.75rem;background:#0b1220;font-family:'Plus Jakarta Sans',sans-serif;}</style></head><body>${aiResultHtml}</body></html>`}
                            style={{ width: '100%', height: '150px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.4rem', background: '#0b1220' }}
                          />
                          <button
                            className="btn-primary"
                            style={{ justifyContent: 'center', fontSize: '0.82rem' }}
                            onClick={handleInsertAiResult}
                          >
                            <Plus size={15} /> Inserir no Slide
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {isExpanded && !isAiItem && (
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
                        onClick={() => (isEditingThisItem ? handleSaveEdit(item) : handleInsert(item))}
                      >
                        {isEditingThisItem ? <><Save size={15} /> Salvar Alterações</> : <><Plus size={15} /> Inserir no Slide</>}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
