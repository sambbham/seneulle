// Seed data + shared helpers.
// This module is dependency-free and safe to import from both the browser
// (storefront, admin) and Node (server seeds its JSON database from here).

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Garment styles available in the 360° viewer and in product art.
export const GARMENT_STYLES = [
  { id: 'tee', label: 'T-shirt' },
  { id: 'dress', label: 'Dress' },
  { id: 'jacket', label: 'Jacket' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'polo', label: 'Polo' },
  { id: 'shirt', label: 'Shirt' },
  { id: 'pants', label: 'Pants' },
];

// Simple SVG silhouettes used as placeholder product art.
const SILHOUETTES = {
  tee: 'M100 26 C86 26 76 34 70 44 L46 38 L24 74 L44 88 L38 110 L32 174 L84 184 L100 172 L116 184 L168 174 L162 110 L156 88 L176 74 L154 38 L130 44 C124 34 114 26 100 26 Z',
  dress: 'M100 20 C85 20 75 29 71 40 L58 44 L53 82 L47 132 L57 176 L88 186 L100 177 L112 186 L143 176 L153 132 L147 82 L142 44 L129 40 C125 29 115 20 100 20 Z',
  jacket: 'M100 28 C86 28 76 35 70 45 L46 38 L24 74 L44 88 L38 110 L32 174 L84 184 L100 172 L116 184 L168 174 L162 110 L156 88 L176 74 L154 38 L130 45 C124 35 114 28 100 28 Z',
  hoodie: 'M100 26 C86 26 76 34 70 44 L48 38 L26 72 L46 86 L40 108 L34 172 L86 182 L100 170 L114 182 L166 172 L160 108 L154 86 L174 72 L152 38 L130 44 C124 34 114 26 100 26 Z',
  polo: 'M100 26 C86 26 76 34 70 44 L48 38 L26 72 L46 86 L40 108 L34 172 L86 182 L100 170 L114 182 L166 172 L160 108 L154 86 L174 72 L152 38 L130 44 C124 34 114 26 100 26 Z',
  shirt: 'M100 26 C86 26 76 34 70 44 L48 38 L26 72 L46 86 L40 108 L34 172 L86 182 L100 170 L114 182 L166 172 L160 108 L154 86 L174 72 L152 38 L130 44 C124 34 114 26 100 26 Z',
  pants: 'M95 30 L62 28 L52 80 L56 128 L62 178 L92 186 L100 182 L108 186 L138 178 L144 128 L148 80 L138 28 L105 30 L100 34 Z',
};

/**
 * Build an inline SVG data-URI "garment card" for a product.
 * Used as placeholder art whenever a product has no real image URL.
 */
export function garmentImage(style, color = '#94a3b8') {
  const d = SILHOUETTES[style] || SILHOUETTES.tee;
  const light = shade(color, 38);
  const dark = shade(color, -42);
  const parts = [];

  parts.push('<rect width="200" height="200" rx="16" fill="#f1f3f5"/>');
  parts.push('<ellipse cx="100" cy="178" rx="58" ry="9" fill="rgba(15,23,42,0.10)"/>');

  if (style === 'hoodie') {
    // hood sits behind the body
    parts.push(`<ellipse cx="100" cy="36" rx="27" ry="21" fill="${dark}"/>`);
  }

  parts.push(`<path d="${d}" fill="url(#g)" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/>`);

  switch (style) {
    case 'jacket':
      parts.push(`<path d="M100 54 L86 86 L100 98 M100 54 L114 86 L100 98" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round" opacity="0.75"/>`);
      parts.push(`<line x1="100" y1="54" x2="100" y2="168" stroke="${dark}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>`);
      break;
    case 'hoodie':
      parts.push(`<path d="M92 64 L88 98 M108 64 L112 98" stroke="${dark}" stroke-width="4" stroke-linecap="round" opacity="0.85"/>`);
      parts.push(`<path d="M78 118 L122 118 L120 140 Q110 152 100 152 Q90 152 80 140 Z" fill="${dark}" opacity="0.16"/>`);
      break;
    case 'polo':
    case 'shirt':
      parts.push(`<path d="M92 40 L100 58 L108 40" fill="none" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/>`);
      parts.push([66, 80, 94].map((y) => `<circle cx="100" cy="${y}" r="3" fill="${dark}"/>`).join(''));
      break;
    case 'dress':
      parts.push(`<line x1="78" y1="98" x2="122" y2="98" stroke="${dark}" stroke-width="2.5" opacity="0.55"/>`);
      break;
    case 'pants':
      parts.push(`<line x1="100" y1="34" x2="100" y2="180" stroke="${dark}" stroke-width="2" opacity="0.3"/>`);
      break;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${color}"/><stop offset="100%" stop-color="${dark}"/>` +
    `</linearGradient></defs>${parts.join('')}</svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ---------------------------------------------------------------------------
// Seed data — the server writes this to data/db.json on first run.
// ---------------------------------------------------------------------------

export const SEED = {
  settings: {
    storeName: 'Threadly',
    heroEyebrow: 'New season · Fresh drops',
    heroHeadline: 'Wear the rotation',
    heroSub:
      'Shop the latest arrivals, restocked favourites and crowd picks — and spin every single piece in full 360° before you buy.',
    aboutHeading: 'Why 360°?',
    aboutText:
      'Fabrics drape, colours shift and details hide in flat photos. Every product at {store} comes with a full 360° viewer — drag to rotate, scroll to zoom, and switch colours before you add to cart.',
    footerNote: '© 2026 Threadly. Demo storefront.',
    announcement: 'Free shipping on orders over $75 — this season only',
    adminPassword: 'admin123',
  },
  categories: [
    { id: 'new', label: 'New Arrival', color: '#059669' },
    { id: 'restocked', label: 'Re-stocked', color: '#d97706' },
    { id: 'popular', label: 'Popular', color: '#e11d48' },
  ],
  products: [
    {
      id: 'demo-spin',
      name: '360° Demo Spin',
      style: 'tee',
      price: 29.99,
      oldPrice: null,
      color: '#7dd3fc',
      colors: ['#7dd3fc'],
      categories: ['new'],
      image: '',
      // Real 360° photo spin: 36 frames in images/spins/demo/frame_01..36.svg.
      // Replace the files with frame_01..36.jpg (and set ext to 'jpg') to use
      // frames extracted from the spin video.
      spin: { base: '/images/spins/demo/frame_', count: 36, ext: 'svg' },
      description: 'A real 360° photo spin — 36 frames. Drag to spin, scroll to zoom. This demo product shows the photo-spin viewer; drop in your own frames to replace it.',
    },
    {
      id: 'p1',
      name: 'Breeze Cotton Tee',
      style: 'tee',
      price: 24.99,
      oldPrice: null,
      color: '#7dd3fc',
      colors: ['#7dd3fc', '#fcd34d', '#f9fafb'],
      categories: ['new'],
      image: '',
      description: 'A featherlight everyday tee in breathable organic cotton with a relaxed fit.',
    },
    {
      id: 'p2',
      name: 'Sunset A-Line Dress',
      style: 'dress',
      price: 54.99,
      oldPrice: 69.99,
      color: '#fda4af',
      colors: ['#fda4af', '#f9a8d4'],
      categories: ['new', 'popular'],
      image: '',
      description: 'Flowy A-line silhouette with a flattering nipped waist. Pairs with everything.',
    },
    {
      id: 'p3',
      name: 'Urban Denim Jacket',
      style: 'jacket',
      price: 79.99,
      oldPrice: null,
      color: '#60a5fa',
      colors: ['#60a5fa', '#93c5fd'],
      categories: ['restocked'],
      image: '',
      description: 'Mid-wash denim jacket with a clean, boxy cut and brushed hardware.',
    },
    {
      id: 'p4',
      name: 'Cozy Fleece Hoodie',
      style: 'hoodie',
      price: 49.99,
      oldPrice: null,
      color: '#a78bfa',
      colors: ['#a78bfa', '#c4b5fd', '#64748b'],
      categories: ['popular'],
      image: '',
      description: 'Brushed fleece inside, soft-touch jersey outside. Your new cold-day uniform.',
    },
    {
      id: 'p5',
      name: 'Classic Oxford Polo',
      style: 'polo',
      price: 39.99,
      oldPrice: null,
      color: '#5eead4',
      colors: ['#5eead4', '#6ee7b7'],
      categories: ['restocked'],
      image: '',
      description: 'Crisp two-button polo with a breathable piqué knit. Dresses up or down.',
    },
    {
      id: 'p6',
      name: 'Aurora Maxi Dress',
      style: 'dress',
      price: 64.99,
      oldPrice: null,
      color: '#c4b5fd',
      colors: ['#c4b5fd', '#ddd6fe'],
      categories: ['new'],
      image: '',
      description: 'Floor-length with a gentle bias drape that moves with you.',
    },
    {
      id: 'p7',
      name: 'Heritage Twill Pants',
      style: 'pants',
      price: 59.99,
      oldPrice: null,
      color: '#94a3b8',
      colors: ['#94a3b8', '#64748b', '#d6d3d1'],
      categories: ['restocked', 'popular'],
      image: '',
      description: 'Structured twill with a relaxed straight leg and deep pockets.',
    },
    {
      id: 'p8',
      name: 'Drift Crewneck Tee',
      style: 'tee',
      price: 19.99,
      oldPrice: null,
      color: '#fb923c',
      colors: ['#fb923c', '#fdba74'],
      categories: ['popular'],
      image: '',
      description: 'Heavyweight cotton crewneck in warm seasonal shades. A wardrobe staple.',
    },
    {
      id: 'p9',
      name: 'Linen Button-Up Shirt',
      style: 'shirt',
      price: 44.99,
      oldPrice: null,
      color: '#fde68a',
      colors: ['#fde68a', '#fef08a'],
      categories: ['new'],
      image: '',
      description: 'Breathable European linen with a relaxed collar and mother-of-pearl buttons.',
    },
    {
      id: 'p10',
      name: 'Winter Wool Coat',
      style: 'jacket',
      price: 129.99,
      oldPrice: 159.99,
      color: '#f472b6',
      colors: ['#f472b6', '#f9a8d4'],
      categories: ['restocked', 'popular'],
      image: '',
      description: 'Double-faced wool with a tailored drape and horn buttons.',
    },
  ],
};
