import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, X } from 'lucide-react';

// Mostra o PIN da sessão ao vivo (já criada ao abrir o editor, ver
// PresentationEditor.jsx useEffect de socket) num QR Code apontando pra
// /remote — mesmo espírito do QR de /join já usado pra alunos (ver
// ActiveMethodologiesOverlay.jsx), só que pra um papel diferente (controle
// remoto, não aluno respondendo quiz). Não precisa gerar nada: o PIN é o
// mesmo que já existe pra sessão inteira.
export default function RemoteControlModal({ isOpen, onClose, pin }) {
  if (!isOpen) return null;

  const remoteUrl = `${window.location.origin}/remote?pin=${pin}`;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Smartphone size={24} color="#fff" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Controle Remoto</h2>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Use o celular pra avançar/voltar slide</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
          Escaneie o QR Code com o celular (ou digite o PIN em <strong>{window.location.host}/remote</strong>) pra transformá-lo num controle remoto desta apresentação.
        </p>

        <div style={{ background: '#fff', padding: '1rem', borderRadius: '0.75rem', display: 'inline-block', marginBottom: '1.25rem' }}>
          <QRCodeSVG value={remoteUrl} size={180} />
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.75rem', padding: '0.9rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            PIN
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.15em' }}>
            {pin}
          </div>
        </div>
      </div>
    </div>
  );
}
