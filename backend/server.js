const express = require('express');
const cors = require('cors');
const zod = require('zod');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ============================================================
// ZOD SCHEMA — module-level, used by all routes
// ============================================================
const zodSceneSchema = zod.object({
  room: zod.object({
    name: zod.string(),
    dimensions: zod.object({ width: zod.number(), depth: zod.number() }),
    floorMaterial: zod.enum(['wood', 'tile', 'carpet', 'concrete', 'grass', 'other']),
    ambientTone: zod.enum(['kitchen', 'living_room', 'outdoor', 'office', 'bedroom', 'generic']),
  }),
  objects: zod.array(zod.object({
    id: zod.string(),
    label: zod.string(),
    position: zod.object({ x: zod.number(), z: zod.number() }),
    size: zod.object({ width: zod.number(), depth: zod.number(), height: zod.number() }),
    soundCue: zod.enum(['table', 'window', 'appliance', 'furniture', 'door', 'generic']),
    material: zod.string().optional(),
  })),
});

// ============================================================
// ============================================================
// OBJECT TEMPLATES — deterministic properties per object type
// ============================================================
const OBJECT_TEMPLATES = {
  // Furniture
  table:          { size: { width: 1.2, depth: 0.8, height: 0.75 }, soundCue: 'table',     material: 'wood' },
  'coffee table': { size: { width: 1.0, depth: 0.6, height: 0.45 }, soundCue: 'table',     material: 'wood' },
  'dining table': { size: { width: 1.6, depth: 0.9, height: 0.75 }, soundCue: 'table',     material: 'wood' },
  desk:           { size: { width: 1.2, depth: 0.6, height: 0.75 }, soundCue: 'table',     material: 'wood' },
  chair:          { size: { width: 0.5, depth: 0.5, height: 0.9 },  soundCue: 'furniture', material: 'wood' },
  armchair:       { size: { width: 0.9, depth: 0.8, height: 0.85 }, soundCue: 'furniture', material: 'fabric' },
  sofa:           { size: { width: 2.0, depth: 0.9, height: 0.85 }, soundCue: 'furniture', material: 'fabric' },
  couch:          { size: { width: 2.0, depth: 0.9, height: 0.85 }, soundCue: 'furniture', material: 'fabric' },
  bench:          { size: { width: 1.4, depth: 0.4, height: 0.45 }, soundCue: 'furniture', material: 'wood' },
  bed:            { size: { width: 2.0, depth: 1.5, height: 0.6 },  soundCue: 'furniture', material: 'fabric' },
  wardrobe:       { size: { width: 1.2, depth: 0.6, height: 2.0 },  soundCue: 'furniture', material: 'wood' },
  closet:         { size: { width: 1.2, depth: 0.6, height: 2.0 },  soundCue: 'furniture', material: 'wood' },
  cupboard:       { size: { width: 0.9, depth: 0.5, height: 1.4 },  soundCue: 'furniture', material: 'wood' },
  cabinet:        { size: { width: 0.8, depth: 0.5, height: 1.0 },  soundCue: 'furniture', material: 'wood' },
  shelf:          { size: { width: 1.0, depth: 0.3, height: 1.8 },  soundCue: 'furniture', material: 'wood' },
  bookshelf:      { size: { width: 1.0, depth: 0.4, height: 1.8 },  soundCue: 'furniture', material: 'wood' },
  lamp:           { size: { width: 0.3, depth: 0.3, height: 1.5 },  soundCue: 'furniture', material: 'metal' },
  rug:            { size: { width: 2.0, depth: 1.5, height: 0.02 }, soundCue: 'generic',   material: 'fabric' },
  carpet:         { size: { width: 2.0, depth: 1.5, height: 0.02 }, soundCue: 'generic',   material: 'fabric' },

  // Architecture / Openings
  window:         { size: { width: 1.0, depth: 0.1, height: 1.2 },  soundCue: 'window',    material: 'glass' },
  door:           { size: { width: 0.9, depth: 0.1, height: 2.0 },  soundCue: 'door',      material: 'wood' },
  doorway:        { size: { width: 0.9, depth: 0.1, height: 2.0 },  soundCue: 'door',      material: 'wood' },
  entrance:       { size: { width: 1.0, depth: 0.2, height: 2.1 },  soundCue: 'door',      material: 'wood' },
  exit:           { size: { width: 1.0, depth: 0.2, height: 2.1 },  soundCue: 'door',      material: 'wood' },

  // Appliances & Tech
  fridge:         { size: { width: 0.7, depth: 0.7, height: 1.8 },  soundCue: 'appliance', material: 'steel' },
  refrigerator:   { size: { width: 0.7, depth: 0.7, height: 1.8 },  soundCue: 'appliance', material: 'steel' },
  sink:           { size: { width: 0.6, depth: 0.5, height: 0.85 }, soundCue: 'appliance', material: 'porcelain' },
  stove:          { size: { width: 0.6, depth: 0.6, height: 0.9 },  soundCue: 'appliance', material: 'steel' },
  oven:           { size: { width: 0.6, depth: 0.6, height: 0.9 },  soundCue: 'appliance', material: 'steel' },
  microwave:      { size: { width: 0.5, depth: 0.4, height: 0.35 }, soundCue: 'appliance', material: 'steel' },
  counter:        { size: { width: 1.5, depth: 0.6, height: 0.9 },  soundCue: 'table',     material: 'stone' },
  tv:             { size: { width: 1.2, depth: 0.1, height: 0.7 },  soundCue: 'appliance', material: 'plastic' },
  television:     { size: { width: 1.2, depth: 0.1, height: 0.7 },  soundCue: 'appliance', material: 'plastic' },
  computer:       { size: { width: 0.6, depth: 0.4, height: 0.45 }, soundCue: 'appliance', material: 'plastic' },
  laptop:         { size: { width: 0.4, depth: 0.3, height: 0.02 }, soundCue: 'appliance', material: 'aluminum' },
  fan:            { size: { width: 0.4, depth: 0.4, height: 1.2 },  soundCue: 'appliance', material: 'plastic' },
  ac:             { size: { width: 0.9, depth: 0.3, height: 0.4 },  soundCue: 'appliance', material: 'plastic' },
  'air conditioner': { size: { width: 0.9, depth: 0.3, height: 0.4 }, soundCue: 'appliance', material: 'plastic' },
  speaker:        { size: { width: 0.3, depth: 0.3, height: 0.5 },  soundCue: 'appliance', material: 'plastic' },

  // Props & Decor
  plant:          { size: { width: 0.4, depth: 0.4, height: 0.8 },  soundCue: 'generic',   material: 'ceramic' },
  tree:           { size: { width: 0.8, depth: 0.8, height: 2.2 },  soundCue: 'generic',   material: 'wood' },
  mirror:         { size: { width: 0.6, depth: 0.05, height: 1.2 }, soundCue: 'window',    material: 'glass' },
  clock:          { size: { width: 0.3, depth: 0.05, height: 0.3 }, soundCue: 'generic',   material: 'plastic' },
  piano:          { size: { width: 1.5, depth: 0.6, height: 1.2 },  soundCue: 'furniture', material: 'wood' },
  guitar:         { size: { width: 0.4, depth: 0.15, height: 1.0 }, soundCue: 'generic',   material: 'wood' },
  'trash can':    { size: { width: 0.3, depth: 0.3, height: 0.5 },  soundCue: 'generic',   material: 'plastic' },
  bin:            { size: { width: 0.3, depth: 0.3, height: 0.5 },  soundCue: 'generic',   material: 'plastic' },
  whiteboard:     { size: { width: 1.8, depth: 0.08, height: 1.0 }, soundCue: 'table',     material: 'metal' },
  podium:         { size: { width: 0.7, depth: 0.5, height: 1.2 },  soundCue: 'table',     material: 'wood' },
  fountain:       { size: { width: 1.5, depth: 1.5, height: 0.8 },  soundCue: 'generic',   material: 'stone' },
};

// Fallback slot pool when spatial placement is unspecified
const POSITION_SLOTS = [
  { nx: 0.50, nz: 0.50 }, // center
  { nx: 0.20, nz: 0.20 }, // NW
  { nx: 0.80, nz: 0.20 }, // NE
  { nx: 0.20, nz: 0.80 }, // SW
  { nx: 0.80, nz: 0.80 }, // SE
  { nx: 0.50, nz: 0.20 }, // North wall
  { nx: 0.50, nz: 0.80 }, // South wall
  { nx: 0.20, nz: 0.50 }, // West wall
  { nx: 0.80, nz: 0.50 }, // East wall
  { nx: 0.35, nz: 0.35 }, // inner NW
  { nx: 0.65, nz: 0.35 }, // inner NE
  { nx: 0.35, nz: 0.65 }, // inner SW
  { nx: 0.65, nz: 0.65 }, // inner SE
];

// Preset archetype defaults — ONLY used if user gives a bare name with NO objects mentioned
const ROOM_DEFAULTS = {
  kitchen: {
    dimensions: { width: 5, depth: 4 }, floorMaterial: 'tile', ambientTone: 'kitchen',
    fallbackObjects: ['table', 'fridge', 'sink', 'stove', 'counter', 'window'],
  },
  living_room: {
    dimensions: { width: 6, depth: 5 }, floorMaterial: 'carpet', ambientTone: 'living_room',
    fallbackObjects: ['sofa', 'coffee table', 'tv', 'lamp', 'bookshelf', 'window'],
  },
  bedroom: {
    dimensions: { width: 5, depth: 4 }, floorMaterial: 'carpet', ambientTone: 'bedroom',
    fallbackObjects: ['bed', 'desk', 'chair', 'lamp', 'wardrobe', 'window'],
  },
  office: {
    dimensions: { width: 5, depth: 4 }, floorMaterial: 'wood', ambientTone: 'office',
    fallbackObjects: ['desk', 'chair', 'bookshelf', 'lamp', 'window', 'door'],
  },
  classroom: {
    dimensions: { width: 8, depth: 6 }, floorMaterial: 'tile', ambientTone: 'office',
    fallbackObjects: ['podium', 'whiteboard', 'desk', 'chair', 'window', 'door'],
  },
  library: {
    dimensions: { width: 9, depth: 7 }, floorMaterial: 'carpet', ambientTone: 'office',
    fallbackObjects: ['bookshelf', 'bookshelf', 'table', 'chair', 'lamp', 'window'],
  },
  outdoor: {
    dimensions: { width: 10, depth: 8 }, floorMaterial: 'grass', ambientTone: 'outdoor',
    fallbackObjects: ['bench', 'table', 'tree', 'plant', 'fountain'],
  },
  generic: {
    dimensions: { width: 6, depth: 5 }, floorMaterial: 'wood', ambientTone: 'generic',
    fallbackObjects: ['table', 'chair', 'window', 'door'],
  },
};

// ============================================================
// NATURAL LANGUAGE SPATIAL SCENE PARSER
// Grounded strictly in the user's free-text description
// ============================================================

function parseRoomTypeAndName(desc) {
  const d = desc.toLowerCase();
  if (d.includes('kitchen')) return { name: 'kitchen', key: 'kitchen' };
  if (d.includes('living room') || d.includes('livingroom') || d.includes('lounge') || d.includes('hall')) return { name: 'living room', key: 'living_room' };
  if (d.includes('bedroom') || d.includes('bed room')) return { name: 'bedroom', key: 'bedroom' };
  if (d.includes('classroom') || d.includes('lecture hall')) return { name: 'classroom', key: 'classroom' };
  if (d.includes('library') || d.includes('reading room')) return { name: 'library', key: 'library' };
  if (d.includes('office') || d.includes('study') || d.includes('workspace')) return { name: 'office', key: 'office' };
  if (d.includes('garden') || d.includes('park') || d.includes('outdoor') || d.includes('patio') || d.includes('yard') || d.includes('backyard')) return { name: 'garden', key: 'outdoor' };
  if (d.includes('hospital') || d.includes('clinic')) return { name: 'hospital room', key: 'generic' };
  if (d.includes('auditorium')) return { name: 'auditorium', key: 'office' };
  if (d.includes('cafe') || d.includes('coffee shop') || d.includes('restaurant')) return { name: 'coffee shop', key: 'living_room' };
  return { name: 'room', key: 'generic' };
}

function parseDimensions(desc, defaultDim) {
  let width = defaultDim.width;
  let depth = defaultDim.depth;

  // e.g. "6 by 4 meters", "8x6m", "10 by 8"
  const byMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:by|x|×|\*)\s*(\d+(?:\.\d+)?)/i);
  if (byMatch) {
    const w = parseFloat(byMatch[1]);
    const d = parseFloat(byMatch[2]);
    if (w >= 2 && w <= 30 && d >= 2 && d <= 30) {
      width = w;
      depth = d;
      return { width, depth };
    }
  }

  // e.g. "8 meters wide and 6 meters deep"
  const wideMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*wide/i);
  const deepMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:deep|long)/i);
  if (wideMatch && deepMatch) {
    const w = parseFloat(wideMatch[1]);
    const d = parseFloat(deepMatch[1]);
    if (w >= 2 && w <= 30 && d >= 2 && d <= 30) {
      width = w;
      depth = d;
      return { width, depth };
    }
  }

  // Relative qualifiers
  const d = desc.toLowerCase();
  if (d.includes('large') || d.includes('huge') || d.includes('spacious') || d.includes('big')) {
    width = Math.min(15, defaultDim.width * 1.5);
    depth = Math.min(15, defaultDim.depth * 1.5);
  } else if (d.includes('small') || d.includes('tiny') || d.includes('compact') || d.includes('narrow')) {
    width = Math.max(3, defaultDim.width * 0.75);
    depth = Math.max(3, defaultDim.depth * 0.75);
  }

  return { width: parseFloat(width.toFixed(1)), depth: parseFloat(depth.toFixed(1)) };
}

function parseFloorMaterial(desc, defaultMat) {
  const d = desc.toLowerCase();
  if (d.includes('hardwood') || d.includes('wooden') || d.includes('wood floor') || d.includes('wood')) return 'wood';
  if (d.includes('tile') || d.includes('tiled') || d.includes('ceramic') || d.includes('marble') || d.includes('granite')) return 'tile';
  if (d.includes('carpet') || d.includes('carpeted') || d.includes('rug')) return 'carpet';
  if (d.includes('concrete') || d.includes('cement') || d.includes('stone')) return 'concrete';
  if (d.includes('grass') || d.includes('lawn') || d.includes('turf') || d.includes('soil')) return 'grass';
  return defaultMat;
}

function parseAmbientTone(roomKey) {
  if (['kitchen', 'living_room', 'outdoor', 'office', 'bedroom'].includes(roomKey)) {
    return roomKey;
  }
  return 'generic';
}

/**
 * Extract objects mentioned in text and calculate accurate spatial coordinates based on context phrases
 */
function extractGroundedObjects(description, roomW, roomD) {
  const text = description.toLowerCase();
  const knownKeys = Object.keys(OBJECT_TEMPLATES).sort((a, b) => b.length - a.length); // match longest first

  // Break text into clauses / phrases to isolate which spatial adjectives apply to which object
  const clauses = text.split(/[,.;\n]|(?:\band\b)/i).map(c => c.trim()).filter(Boolean);

  const foundObjects = [];
  const halfW = roomW / 2;
  const halfD = roomD / 2;
  const margin = 0.5;

  let slotIndex = 0;

  for (const clause of clauses) {
    for (const key of knownKeys) {
      // Word boundary check to avoid false substrings (e.g., 'cat' in 'scatter')
      const regex = new RegExp(`\\b${key}s?\\b`, 'i');
      if (regex.test(clause)) {
        // Prevent adding duplicate identical entry from exact same clause
        const alreadyInClause = foundObjects.some(o => o._clause === clause && o.label === key);
        if (alreadyInClause) continue;

        let posX = null;
        let posZ = null;

        // --- Spatial Position Reasoning ---
        const isCenter = clause.includes('center') || clause.includes('centre') || clause.includes('middle');
        const isNorth = clause.includes('north') || clause.includes('front wall') || clause.includes('ahead') || clause.includes('far wall');
        const isSouth = clause.includes('south') || clause.includes('back wall') || clause.includes('entrance') || clause.includes('behind');
        const isWest = clause.includes('west') || clause.includes('left wall') || clause.includes('left side') || clause.includes('on the left') || clause.includes('on my left') || clause.includes('to the left');
        const isEast = clause.includes('east') || clause.includes('right wall') || clause.includes('right side') || clause.includes('on the right') || clause.includes('on my right') || clause.includes('to the right');
        const isCorner = clause.includes('corner');

        if (isCenter) {
          posX = 0;
          posZ = 0;
        } else if (isCorner) {
          if (isWest || isNorth || clause.includes('north-west') || clause.includes('top-left') || clause.includes('northwest')) {
            posX = -halfW + margin;
            posZ = -halfD + margin;
          } else if (isEast || clause.includes('north-east') || clause.includes('top-right') || clause.includes('northeast')) {
            posX = halfW - margin;
            posZ = -halfD + margin;
          } else if (clause.includes('south-west') || clause.includes('bottom-left') || clause.includes('southwest')) {
            posX = -halfW + margin;
            posZ = halfD - margin;
          } else if (clause.includes('south-east') || clause.includes('bottom-right') || clause.includes('southeast')) {
            posX = halfW - margin;
            posZ = halfD - margin;
          } else {
            // General corner: pick an unused corner
            const cornerSlots = [
              { x: -halfW + margin, z: -halfD + margin },
              { x: halfW - margin, z: -halfD + margin },
              { x: -halfW + margin, z: halfD - margin },
              { x: halfW - margin, z: halfD - margin },
            ];
            const chosen = cornerSlots[slotIndex % cornerSlots.length];
            posX = chosen.x;
            posZ = chosen.z;
          }
        } else if (isNorth) {
          posZ = -halfD + margin;
          posX = isWest ? (-halfW * 0.5) : isEast ? (halfW * 0.5) : 0;
        } else if (isSouth) {
          posZ = halfD - margin;
          posX = isWest ? (-halfW * 0.5) : isEast ? (halfW * 0.5) : 0;
        } else if (isWest) {
          posX = -halfW + margin;
          posZ = isNorth ? (-halfD * 0.5) : isSouth ? (halfD * 0.5) : 0;
        } else if (isEast) {
          posX = halfW - margin;
          posZ = isNorth ? (-halfD * 0.5) : isSouth ? (halfD * 0.5) : 0;
        } else if (clause.includes('next to') || clause.includes('beside') || clause.includes('by the') || clause.includes('near')) {
          // Place relative to the previous object if one exists
          if (foundObjects.length > 0) {
            const prev = foundObjects[foundObjects.length - 1];
            posX = prev.position.x + (prev.position.x > 0 ? -1.0 : 1.0);
            posZ = prev.position.z + 0.3;
          }
        }

        // If no spatial keyword in clause, use distributed placement
        if (posX === null || posZ === null) {
          const slot = POSITION_SLOTS[slotIndex % POSITION_SLOTS.length];
          posX = (slot.nx - 0.5) * roomW;
          posZ = (slot.nz - 0.5) * roomD;
        }

        slotIndex++;

        const template = OBJECT_TEMPLATES[key] || OBJECT_TEMPLATES.table;

        foundObjects.push({
          id: String(foundObjects.length + 1),
          label: key,
          position: {
            x: parseFloat(posX.toFixed(2)),
            z: parseFloat(posZ.toFixed(2)),
          },
          size: { ...template.size },
          soundCue: template.soundCue,
          material: template.material,
          _clause: clause,
        });
      }
    }
  }

  return foundObjects;
}

function generateSceneFromDescription(description) {
  const rawDesc = description.trim();
  const { name, key } = parseRoomTypeAndName(rawDesc);
  const archetype = ROOM_DEFAULTS[key] || ROOM_DEFAULTS.generic;
  const dimensions = parseDimensions(rawDesc, archetype.dimensions);
  const floorMaterial = parseFloorMaterial(rawDesc, archetype.floorMaterial);
  const ambientTone = parseAmbientTone(key);

  // Extract ONLY objects described by the user
  let objects = extractGroundedObjects(rawDesc, dimensions.width, dimensions.depth);

  // ONLY if the user described NO objects at all (e.g. simply typed "a kitchen"),
  // use the archetype defaults. Otherwise, respect strictly what the user described!
  if (objects.length === 0) {
    const defaultList = archetype.fallbackObjects.slice(0, 5);
    const halfW = dimensions.width / 2;
    const halfD = dimensions.depth / 2;
    objects = defaultList.map((objName, i) => {
      const template = OBJECT_TEMPLATES[objName] || OBJECT_TEMPLATES.table;
      const slot = POSITION_SLOTS[i % POSITION_SLOTS.length];
      return {
        id: String(i + 1),
        label: objName,
        position: {
          x: parseFloat(((slot.nx - 0.5) * dimensions.width).toFixed(2)),
          z: parseFloat(((slot.nz - 0.5) * dimensions.depth).toFixed(2)),
        },
        size: { ...template.size },
        soundCue: template.soundCue,
        material: template.material,
      };
    });
  }

  // Clean internal properties
  for (const obj of objects) {
    delete obj._clause;
  }

  // Nudge overlapping objects apart
  nudgeOverlaps(objects);

  // Clamp all positions within room bounds (with margin)
  const margin = 0.3;
  for (const obj of objects) {
    obj.position.x = Math.max(-dimensions.width / 2 + margin, Math.min(dimensions.width / 2 - margin, obj.position.x));
    obj.position.z = Math.max(-dimensions.depth / 2 + margin, Math.min(dimensions.depth / 2 - margin, obj.position.z));
    obj.position.x = parseFloat(obj.position.x.toFixed(2));
    obj.position.z = parseFloat(obj.position.z.toFixed(2));
  }

  return {
    room: {
      name,
      dimensions,
      floorMaterial,
      ambientTone,
    },
    objects,
  };
}

// Nudge overlapping objects apart iteratively
function nudgeOverlaps(objects) {
  const MAX_ITERATIONS = 20;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let anyOverlap = false;
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = (a.size.width + b.size.width) / 2 + 0.5;
        if (dist < minDist) {
          anyOverlap = true;
          // Push apart along the vector between them
          const pushDist = (minDist - dist) / 2 + 0.1;
          const angle = Math.atan2(dz, dx);
          a.position.x += Math.cos(angle) * pushDist;
          a.position.z += Math.sin(angle) * pushDist;
          b.position.x -= Math.cos(angle) * pushDist;
          b.position.z -= Math.sin(angle) * pushDist;
          // Round to 2 decimal places
          a.position.x = parseFloat(a.position.x.toFixed(2));
          a.position.z = parseFloat(a.position.z.toFixed(2));
          b.position.x = parseFloat(b.position.x.toFixed(2));
          b.position.z = parseFloat(b.position.z.toFixed(2));
        }
      }
    }
    if (!anyOverlap) break;
  }
}

async function callGeminiIfAvailable(description) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = `You are a spatial scene generator for EchoRoom, an audio navigation app for blind users.
Generate a strict JSON scene graph from this description: "${description}".
Use this schema strictly:
{
  "room": {
    "name": string,
    "dimensions": { "width": number, "depth": number },
    "floorMaterial": "wood" | "tile" | "carpet" | "concrete" | "grass" | "other",
    "ambientTone": "kitchen" | "living_room" | "outdoor" | "office" | "bedroom" | "generic"
  },
  "objects": [
    {
      "id": string,
      "label": string,
      "position": { "x": number, "z": number },
      "size": { "width": number, "depth": number, "height": number },
      "soundCue": "table" | "window" | "appliance" | "furniture" | "door" | "generic",
      "material": string
    }
  ]
}
Rules:
- Room dimensions between 2m and 25m.
- ONLY include objects explicitly described by the user! Never hallucinate or inject objects not in the prompt.
- Object (x, z) coordinates must be within the room boundaries centered at (0, 0): x in [-width/2, width/2], z in [-depth/2, depth/2].
- Place objects in the spatial locations described (e.g. north = negative z, south = positive z, west = negative x, east = positive x, center = (0, 0)).
- Output ONLY valid raw JSON, nothing else.`;

    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        const validated = zodSceneSchema.parse(parsed);
        return validated;
      }
    }
  } catch (err) {
    console.warn('Gemini API call skipped or failed, falling back to grounded parser:', err.message);
  }
  return null;
}

// ============================================================
// EXPRESS ROUTES
// ============================================================

app.post('/api/generate-scene', async (req, res) => {
  const { description } = req.body;
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: 'A room description is required.' });
  }

  try {
    // 1. Try Gemini LLM if API key is provided
    let scene = await callGeminiIfAvailable(description.trim());

    // 2. Otherwise, use deterministic grounded spatial parser
    if (!scene) {
      scene = generateSceneFromDescription(description.trim());
    }

    // Validate with Zod
    let validated;
    try {
      validated = zodSceneSchema.parse(scene);
    } catch (zodErr) {
      console.error('Zod validation failed, using unvalidated scene:', zodErr.message);
      validated = scene;
    }

    return res.json({ sceneGraph: validated });
  } catch (error) {
    console.error('Scene generation error:', error.message);
    return res.status(500).json({ error: 'Failed to generate scene. Please try again.' });
  }
});

app.post('/api/spatial-qa', (req, res) => {
  const { question, sceneGraph, listenerPosition, listenerFacing, objectInfos } = req.body;

  if (!question || !sceneGraph || !listenerPosition || listenerFacing === undefined || !objectInfos) {
    return res.status(400).json({ error: 'Missing required parameters for spatial Q&A.' });
  }

  try {
    const questionLower = question.toLowerCase().trim();
    const room = sceneGraph.room;

    // Sort objects by distance for consistent ordering
    const sortedInfos = [...objectInfos].sort((a, b) => a.distance - b.distance);
    const nearObjects = sortedInfos.filter(obj => obj.distance <= 3);
    const veryNearObjects = sortedInfos.filter(obj => obj.distance <= 1.5);

    let answer;

    // ---- "What's near me" ----
    if (questionLower.includes('near me') || questionLower.includes('around me') || questionLower.includes('close to me')) {
      if (nearObjects.length === 0) {
        answer = 'There is nothing within reach right now. Try moving forward to explore.';
      } else {
        const descriptions = nearObjects.map(obj =>
          `a ${obj.label} about ${obj.distance.toFixed(1)} meters to your ${obj.relativeDirection.replace('-', ' ')}`
        );
        if (descriptions.length === 1) {
          answer = `Near you is ${descriptions[0]}.`;
        } else {
          const last = descriptions.pop();
          answer = `Near you are ${descriptions.join(', ')}, and ${last}.`;
        }
      }
    }

    // ---- Directional queries ----
    else if (questionLower.includes('in front') || questionLower.includes('ahead')) {
      const frontObjects = sortedInfos.filter(obj =>
        obj.relativeDirection === 'front' || obj.relativeDirection === 'front-left' || obj.relativeDirection === 'front-right'
      );
      if (frontObjects.length > 0) {
        const descriptions = frontObjects.slice(0, 3).map(obj =>
          `a ${obj.label} about ${obj.distance.toFixed(1)} meters away to your ${obj.relativeDirection.replace('-', ' ')}`
        );
        answer = `In front of you: ${descriptions.join('; ')}.`;
      } else {
        answer = 'There is nothing directly in front of you right now.';
      }
    }
    else if (questionLower.includes('to my left') || questionLower.includes('on my left')) {
      const leftObjects = sortedInfos.filter(obj =>
        obj.relativeDirection === 'left' || obj.relativeDirection === 'front-left' || obj.relativeDirection === 'back-left'
      );
      if (leftObjects.length > 0) {
        const descriptions = leftObjects.slice(0, 3).map(obj =>
          `a ${obj.label} about ${obj.distance.toFixed(1)} meters away`
        );
        answer = `To your left: ${descriptions.join('; ')}.`;
      } else {
        answer = 'There is nothing to your left.';
      }
    }
    else if (questionLower.includes('to my right') || questionLower.includes('on my right')) {
      const rightObjects = sortedInfos.filter(obj =>
        obj.relativeDirection === 'right' || obj.relativeDirection === 'front-right' || obj.relativeDirection === 'back-right'
      );
      if (rightObjects.length > 0) {
        const descriptions = rightObjects.slice(0, 3).map(obj =>
          `a ${obj.label} about ${obj.distance.toFixed(1)} meters away`
        );
        answer = `To your right: ${descriptions.join('; ')}.`;
      } else {
        answer = 'There is nothing to your right.';
      }
    }
    else if (questionLower.includes('behind') || questionLower.includes('back')) {
      const behindObjects = sortedInfos.filter(obj =>
        obj.relativeDirection === 'back' || obj.relativeDirection === 'back-left' || obj.relativeDirection === 'back-right'
      );
      if (behindObjects.length > 0) {
        const descriptions = behindObjects.slice(0, 3).map(obj =>
          `a ${obj.label} about ${obj.distance.toFixed(1)} meters away to your ${obj.relativeDirection.replace('-', ' ')}`
        );
        answer = `Behind you: ${descriptions.join('; ')}.`;
      } else {
        answer = 'There is nothing behind you.';
      }
    }

    // ---- Full recap ----
    else if (questionLower.includes('recap') || questionLower.includes('describe the room') || questionLower.includes('room layout') || questionLower.includes('everything')) {
      const objectDescs = sceneGraph.objects.map(obj => {
        const info = sortedInfos.find(i => i.label === obj.label);
        if (info) {
          return `a ${obj.label}, ${info.distance.toFixed(1)} meters to your ${info.relativeDirection.replace('-', ' ')}`;
        }
        return `a ${obj.label}`;
      });
      answer = `You are in a ${room.name} with ${room.floorMaterial} flooring. ` +
        `The room is ${room.dimensions.width} meters wide and ${room.dimensions.depth} meters deep. ` +
        `It contains: ${objectDescs.join('; ')}.`;
    }

    // ---- Asking about a specific object ----
    else {
      // Check if question mentions a specific object label
      const mentionedObj = sortedInfos.find(obj => questionLower.includes(obj.label.toLowerCase()));
      if (mentionedObj) {
        answer = `The ${mentionedObj.label} is about ${mentionedObj.distance.toFixed(1)} meters away, to your ${mentionedObj.relativeDirection.replace('-', ' ')}.`;
      } else {
        // Generic fallback
        if (nearObjects.length > 0) {
          const nearest = nearObjects[0];
          answer = `The nearest object is a ${nearest.label}, about ${nearest.distance.toFixed(1)} meters to your ${nearest.relativeDirection.replace('-', ' ')}. ` +
            `There are ${sceneGraph.objects.length} objects in this ${room.name}. Press R for a full recap.`;
        } else {
          answer = `You are in a ${room.name} with ${sceneGraph.objects.length} objects. ` +
            `Nothing is very close right now. Try moving around to explore, or press R for a full recap.`;
        }
      }
    }

    return res.json({ answer });
  } catch (error) {
    console.error('Spatial Q&A error:', error.message);
    return res.json({ answer: 'Sorry, I could not process that question. Try asking "what is near me" or pressing R for a recap.' });
  }
});

// ============================================================
// CATCH-ALL & START
// ============================================================

app.use(function (req, res) {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, function () {
  console.log('EchoRoom backend running on port ' + PORT);
  console.log('Mock mode active — no API key required');
  console.log('Frontend expected at: http://localhost:5173');
});