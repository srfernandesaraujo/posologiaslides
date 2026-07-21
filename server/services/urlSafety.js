import dns from 'dns/promises';
import net from 'net';

// Bloqueia requisições a endereços privados, loopback, link-local (inclui o
// endpoint de metadata de nuvem 169.254.169.254) e outras faixas reservadas,
// para evitar que a rota de importação de URL seja usada como proxy SSRF.

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);

function isBlockedIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;

  if (a === 127) return true; // loopback
  if (a === 10) return true; // privada
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 169 && b === 254) return true; // link-local / metadata de nuvem
  if (a === 0) return true; // "esta rede"
  if (a >= 224) return true; // multicast / reservado
  return false;
}

function isBlockedIPv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1)
    return isBlockedIPv4(normalized.split(':').pop());
  }
  return false;
}

function isBlockedIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // não reconhecido, bloqueia por precaução
}

/**
 * Valida se uma URL é segura para o servidor buscar (protocolo http/https e
 * não aponta para um endereço IP privado/loopback/link-local após resolução DNS).
 * Lança um Error com mensagem amigável caso a URL não seja permitida.
 */
export async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Apenas URLs http/https são permitidas.');
  }

  const hostname = parsed.hostname;
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error('Este endereço não pode ser acessado.');
  }

  // Se o host já é um IP literal, valida diretamente
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Este endereço não pode ser acessado.');
    }
    return parsed;
  }

  // Resolve o DNS e valida todos os IPs retornados (evita redirecionar para IP interno)
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Não foi possível resolver o endereço informado.');
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('Este endereço não pode ser acessado.');
  }

  return parsed;
}
