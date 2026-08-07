import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

// Mesma sintaxe "linha por linha, células separadas por |" que buildTable
// (blockCatalog.js) já espera em `config.rows` — este editor só troca o
// textarea de texto cru por uma grade clicável, o contrato de dados (string
// serializada) continua igual, então buildHtml/getElementMeta não mudam.
function parseGrid(raw) {
  const lines = (raw || '').split('\n');
  return lines.map((line) => line.split('|').map((cell) => cell.trim()));
}

function serializeGrid(grid) {
  return grid.map((row) => row.join(' | ')).join('\n');
}

const cellInputStyle = {
  width: '100%',
  minWidth: '64px',
  boxSizing: 'border-box',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: '0.35rem 0.4rem',
  fontFamily: 'inherit'
};

export default function TableFieldEditor({ value, onChange }) {
  // Estado local só existe enquanto este card estiver expandido (remonta do
  // zero a cada abrir, ver isExpanded em WidgetLibraryDrawer.jsx) — evita o
  // vaivém de sincronizar de volta com a prop `value` a cada tecla digitada.
  const [grid, setGrid] = useState(() => {
    const parsed = parseGrid(value);
    return parsed.length ? parsed : [['']];
  });

  const commit = (nextGrid) => {
    setGrid(nextGrid);
    onChange(serializeGrid(nextGrid));
  };

  const setCell = (r, c, text) => {
    const next = grid.map((row) => [...row]);
    next[r][c] = text;
    commit(next);
  };

  const addRow = () => {
    const cols = grid[0]?.length || 1;
    commit([...grid, Array(cols).fill('')]);
  };

  const removeRow = (r) => {
    if (grid.length <= 2) return; // mantém cabeçalho + pelo menos 1 linha de dados
    commit(grid.filter((_, i) => i !== r));
  };

  const addColumn = () => {
    commit(grid.map((row) => [...row, '']));
  };

  const removeColumn = (c) => {
    if ((grid[0]?.length || 0) <= 1) return;
    commit(grid.map((row) => row.filter((_, i) => i !== c)));
  };

  const [header, ...body] = grid;
  const colCount = header?.length || 0;

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.4rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {header.map((cell, c) => (
                <th key={c} style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(34,211,238,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      value={cell}
                      placeholder={`Coluna ${c + 1}`}
                      onChange={(e) => setCell(0, c, e.target.value)}
                      style={{ ...cellInputStyle, color: '#67e8f9', fontWeight: 700, fontSize: '0.72rem' }}
                    />
                    {colCount > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(c)}
                        title="Remover coluna"
                        className="btn-icon"
                        style={{ width: '18px', height: '18px', flexShrink: 0, marginRight: '0.15rem' }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, c) => (
                  <td key={c} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        value={cell}
                        onChange={(e) => setCell(rIdx + 1, c, e.target.value)}
                        style={{ ...cellInputStyle, color: '#e2e8f0', fontSize: '0.78rem' }}
                      />
                      {c === row.length - 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(rIdx + 1)}
                          title="Remover linha"
                          className="btn-icon"
                          style={{ width: '18px', height: '18px', flexShrink: 0, marginRight: '0.15rem' }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
        <button type="button" className="btn-secondary" style={{ fontSize: '0.72rem', fontWeight: 600, gap: '0.25rem', padding: '0.3rem 0.5rem' }} onClick={addRow}>
          <Plus size={12} /> Linha
        </button>
        <button type="button" className="btn-secondary" style={{ fontSize: '0.72rem', fontWeight: 600, gap: '0.25rem', padding: '0.3rem 0.5rem' }} onClick={addColumn}>
          <Plus size={12} /> Coluna
        </button>
      </div>
    </div>
  );
}
