// Rules for the proof (screenshot) that is mandatory to complete a task. Pure functions, no server imports.

export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

export interface ImageType {
  mime: string;
  ext: string;
}

// Identifies the file by its first bytes, so a renamed .exe or a text file cannot pass as a screenshot.
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type ProofCheck = { ok: true; type: ImageType } | { ok: false; error: string };

export function checkProof(bytes: Uint8Array | null): ProofCheck {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: "Para concluir a tarefa é obrigatório enviar a print do que foi feito." };
  }
  if (bytes.length > MAX_PROOF_BYTES) {
    return { ok: false, error: "A print é muito grande (máximo de 8MB). Tire uma print menor." };
  }
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "O arquivo enviado não é uma imagem (use PNG, JPG, GIF ou WEBP)." };
  return { ok: true, type };
}
