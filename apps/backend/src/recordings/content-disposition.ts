/**
 * Builds a `Content-Disposition: attachment` value that is safe to send as a
 * header. `originalName` comes from user input, so the ASCII `filename` fallback
 * is stripped of characters that are illegal in a quoted-string (control chars,
 * `"`, `\`) or would let a naive client write outside its download dir (`/`),
 * and the real name is carried in the RFC 8187 `filename*` parameter.
 */
export function attachmentContentDisposition(originalName: string): string {
  const asciiFallback = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\/]/g, '_');
  // encodeURIComponent leaves ' ( ) * unescaped, but RFC 8187 attr-char forbids
  // them — percent-encode those too so the value parses in strict HTTP clients.
  const encoded = encodeURIComponent(originalName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
