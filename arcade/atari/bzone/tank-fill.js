// Face topology and ink from reference-vector-tank-piece.json. Vertices 0–23
// match the rev 2 standard tank; 24–31 are the separate rotating radar object.
// Use ROM-projected endpoints, not the reference model's edited coordinates.
export const TANK_FACES = Object.freeze({
  "2": [
    {
      "indices": [
        0,
        1,
        2,
        3
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        0,
        1,
        5,
        4
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        1,
        2,
        6,
        5
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        2,
        3,
        7,
        6
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        3,
        0,
        4,
        7
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        4,
        5,
        9,
        8
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        5,
        6,
        10,
        9
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        6,
        7,
        11,
        10
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        7,
        4,
        8,
        11
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        8,
        9,
        13,
        12
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        9,
        10,
        13
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        10,
        11,
        12,
        13
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        11,
        8,
        12
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        14,
        15,
        18,
        20
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        15,
        16,
        19,
        18
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        16,
        17,
        21,
        19
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        17,
        14,
        20,
        21
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        20,
        18,
        19,
        21
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    }
  ],
  "13": [
    {
      "indices": [
        0,
        1,
        2,
        3
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        4,
        5,
        6,
        7
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    },
    {
      "indices": [
        0,
        3,
        7,
        4
      ],
      "color": "#39ff14",
      "glow": "#003800",
      "isCore": false
    }
  ]
});

export function tankPolygons(vectors,type) {
 const points=new Map();
 for(const v of vectors) {
  const edge=v[8]?.tankEdge;
  if(!edge)continue;
  points.set(edge[0],[v[0],v[1]]);points.set(edge[1],[v[2],v[3]]);
 }
 return (TANK_FACES[type]??[]).flatMap(face=>{
  const polygon=face.indices.map(i=>points.get(i));
  if(polygon.some(p=>!p))return []; // Never bridge missing/unknown vertices.
  // Same winding makes overlapping faces a union under Canvas nonzero fill,
  // avoiding holes or repeated opacity where front/back faces overlap.
  const area=polygon.reduce((sum,p,i)=>{
   const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];
  },0);
  if(Math.abs(area)<1e-8)return [];
  if(area<0)polygon.reverse();
  return [{...face,points:polygon}];
 });
}
