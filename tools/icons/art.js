// Gemeinsame Grafik für Icon und Banner: Skyline mit Krone
var DEFS = '<defs>' +
  '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset=".55" stop-color="#312e81"/><stop offset="1" stop-color="#0b1120"/></linearGradient>' +
  '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>' +
  '<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#facc15" stop-opacity=".55"/><stop offset="1" stop-color="#facc15" stop-opacity="0"/></radialGradient>' +
  '</defs>';
function building(x, base, w, h, col, roof) {
  var s = '<rect x="' + x + '" y="' + (base - h) + '" width="' + w + '" height="' + h + '" rx="6" fill="' + col + '"/>' +
          '<rect x="' + (x - 4) + '" y="' + (base - h - 10) + '" width="' + (w + 8) + '" height="14" rx="5" fill="' + roof + '"/>';
  var cols = Math.max(1, Math.floor((w - 12) / 22)), gap = (w - cols * 14) / (cols + 1);
  for (var r = 0; base - h + 18 + r * 30 < base - 34; r++)
    for (var c = 0; c < cols; c++)
      s += '<rect x="' + (x + gap + c * (14 + gap)) + '" y="' + (base - h + 18 + r * 30) + '" width="14" height="18" rx="3" fill="' + ((r + c) % 3 ? '#fde68a' : '#0f172a') + '" opacity=".9"/>';
  s += '<rect x="' + (x + w / 2 - 12) + '" y="' + (base - 30) + '" width="24" height="30" rx="4" fill="#0f172a" opacity=".8"/>';
  return s;
}
function skyline(cx, base, k) {
  var b = [[-200, 64, 150, '#f59e0b', '#b45309'], [-128, 70, 220, '#22d3ee', '#0e7490'], [-50, 100, 280, '#a78bfa', '#6d28d9'], [58, 72, 200, '#4ade80', '#15803d'], [138, 62, 130, '#f472b6', '#be185d']];
  var s = '<g transform="translate(' + cx + ',' + base + ') scale(' + k + ')">';
  b.forEach(function (d) { s += building(d[0], 0, d[1], d[2], d[3], d[4]); });
  return s + '<rect x="-230" y="0" width="460" height="16" rx="8" fill="#0f172a"/></g>';
}
function crown(cx, cy, k) {
  return '<g transform="translate(' + cx + ',' + cy + ') scale(' + k + ')">' +
    '<circle cx="0" cy="0" r="120" fill="url(#glow)"/>' +
    '<path d="M-80 40 L-92 -40 L-46 -6 L0 -62 L46 -6 L92 -40 L80 40 Z" fill="url(#gold)" stroke="#92400e" stroke-width="6" stroke-linejoin="round"/>' +
    '<rect x="-84" y="36" width="168" height="24" rx="8" fill="url(#gold)" stroke="#92400e" stroke-width="6"/>' +
    '<circle cx="-92" cy="-44" r="11" fill="#fef08a" stroke="#92400e" stroke-width="5"/><circle cx="0" cy="-68" r="12" fill="#fef08a" stroke="#92400e" stroke-width="5"/><circle cx="92" cy="-44" r="11" fill="#fef08a" stroke="#92400e" stroke-width="5"/>' +
    '<circle cx="0" cy="12" r="12" fill="#f472b6"/><circle cx="-44" cy="18" r="9" fill="#22d3ee"/><circle cx="44" cy="18" r="9" fill="#22d3ee"/>' +
    '</g>';
}
