"use client";

// Small, original silhouettes drawn from city skyline photo references in
// CITY_SKYLINE_REFERENCES.md. These are decoration, never geographic evidence.
const skylines: Record<string, { far: string; near: string; detail?: string }> = {
  Atlanta: { far: "M0 65V53h25V43h18v14h16V31h17v26h15V39h13v18h17V28h22v29h12V39h18v18h16V30h22v27h31V44h24v21Z", near: "M0 80V67h80V40h12V29h7V18h5V8h4v10h6v11h8v38h29V32h8V21h9v11h8v35h32V54h27v26Z" },
  Austin: { far: "M0 68V55h37V45h22v13h24V36h18v22h15V48h30v10h20V39h23v19h25V50h26v18Z", near: "M0 80V68h28V60h16v-8h7v-8h6v-6h7v6h5v8h6v16h30V40h4v-6h4v-7h4v-8h5v8h5v7h4v6h5v28h25V33h5V22h8V12h5v10h8v11h5v35h41V55h15v25Z" },
  Dallas: { far: "M0 66V54h27V43h23v11h22V34h14v20h22V43h20v11h15V29h19v25h21V39h21v15h28V46h28v20Z", near: "M0 80V68h31V28h3V18h16v10h3v40h31V48h6V27h6V16h5V7h4v9h5v11h6v41h29V34h7V24h7v-8h10v8h7v10h8v34h41V55h24v25Z", detail: "M25 18a17 10 0 1 0 34 0a17 10 0 1 0-34 0M43 8v-7M36 68V29M48 68V29" },
  Denver: { far: "M0 58 23 43 39 49 63 25 81 38 103 16 125 43 145 29 166 48 186 30 213 48 236 38 260 55v25H0Z", near: "M0 80V66h56V48h22v18h13V29h9V20h18v9h9v37h17V37h8v-9h25v38h18V42h22v24h43v14Z" },
  Houston: { far: "M0 68V56h25V43h20v13h20V29h18v27h18V45h16v11h15V33h19v23h18V41h20v15h16V36h19v20h36v12Z", near: "M0 80V69h43V48h9V35h8V20h15v15h7v13h9v21h32V36h7V22h9V10h7V4h5v6h7v12h9v14h7v33h26V52h10V41h22v28h31v11Z" },
  "Las Vegas": { far: "M0 70V56h23V42h22v14h25V49h19v7h20V37h27v19h23V45h24v11h26V40h26v16h25v14Z", near: "M0 80V65h31l25-30 27 30h15V20h3v-9h5V1h4v10h5v9h3v45h43V38h28v27h21V50h18v15h31v15Z", detail: "M91 20h34M97 23v-4M110 20V8M225 43a22 22 0 1 1-44 0a22 22 0 1 1 44 0M203 65V21" },
  "Los Angeles": { far: "M0 68V56h28V47h23v9h14V36h21v20h18V42h18v14h24V35h17v21h27V44h18v12h23V48h29v20Z", near: "M0 80V67h31V40h10V30h18v10h10v27h22V25h6v-6h7v-6h10v6h7v6h7v42h23V35h6V23h6V9h4V3h3v6h5v14h7v12h6v32h28V52h25v28Z" },
  Miami: { far: "M0 69V48h20v21h18V38h15v31h12V32h21v37h15V47h14v22h10V35h17v34h13V42h18v27h13V31h17v38h12V51h23v18h32v11H0Z", near: "M0 80V67h43V39h4V27h12v12h5v28h31V43h5V28h4V17h5v11h5v15h5v24h26V29h4V21h7v-8h5v8h7v8h4v38h29V37h6V23h15v14h6v30h31V53h18v27Z", detail: "M0 73Q68 70 128 74T260 72M0 78Q80 75 155 79T260 77" },
  Nashville: { far: "M0 69V55h31V43h24v12h25V46h21v9h12V32h21v23h20V41h22v14h18V34h22v21h16V46h28v23Z", near: "M0 80V69h60V51h9V36h7V24h4v-9h3v9h7v12h4v-12h3v-9h3v9h7v12h7v33h34V37h8V23h10v14h8v32h36V50h27v19h26v11Z" },
  Orlando: { far: "M0 68V53h30V41h18v12h18V37h20v16h17V32h20v21h22V43h23v10h20V38h22v15h30v15Z", near: "M0 80V67h39V48h8V31h11v17h7v19h27V41h7V28h10V17h8v11h9v13h7v26h27V32h9V19h13v13h9v35h37V54h26v26Z", detail: "M10 78Q70 69 130 78T260 76M36 64 46 49 56 64M46 51V39" },
  Phoenix: { far: "M0 59 24 53 49 34 65 42 83 23 104 49 124 56 150 38 165 48 184 30 211 56 238 49 260 55v25H0Z", near: "M0 80V69h43V51h17v18h22V40h7V29h9V14h6V8h4v6h6v15h9v11h7v29h30V42h8V28h23v41h35V53h16v16h24v11Z", detail: "M29 68V36m0 10-8-6m8 14 10-9M235 68V41m0 9-10-5m10 12 11-8" },
  "San Antonio": { far: "M0 68V54h29V46h16v8h19V37h22v17h17V43h20v11h13V35h23v19h18V41h20v13h28V48h35v20Z", near: "M0 80V70h63V49h16V31h9v18h17v21h19V23h4V16h5V7h4v9h6v7h4v47h23V43h12V29h14v14h11v27h53v10Z", detail: "M121 22h34v8h-34zM137 7V0M128 30l-5 40M147 30l6 40" },
  "San Diego": { far: "M0 68V52h25V42h22v10h22V33h17v19h19V43h20v9h15V26h16v26h23V37h21v15h16V43h23v9h21v16Z", near: "M0 80V68h60V43h7V29h18v14h9v25h29V36h7V21h8V9h4v12h10v15h7v32h24V30h6V19h16v11h7v38h48V56h20v24Z", detail: "M0 75Q65 61 132 71T260 61M0 80h260" },
  "San Francisco Bay Area": { far: "M0 68V54h28V43h18v11h22V37h16v17h17V47h24v7h20V38h17v16h18V45h19v9h61v14Z", near: "M0 80V69h31V53h9V38h7V30h4v-7h4v7h5v8h6v15h7v16h24V46l20-42 19 42v23h33V26h5V16h3V9h9v7h4v10h5v43h27V50h28v19h20v11Z", detail: "M1 70Q40 54 78 68M0 70v10M14 64v16M29 62v18M44 63v17M58 66v14" },
  Tampa: { far: "M0 68V51h24V40h18v11h19V37h20v14h22V31h16v20h22V39h18v12h17V34h21v17h20V43h23v25Z", near: "M0 80V68h38V51h5V34h4v-8h5v8h4v17h7v17h26V43h7V28h8V18h8v10h9v15h7v25h23V38h8V26h10v-8h17v8h10v12h8v30h26V52h17v16h20v12Z", detail: "M0 76Q78 70 145 76T260 74M52 26V18m109 0v-9" },
};

export function CityBackdrop({ market }: { market: string }) {
  const scene = skylines[market] ?? skylines[market.replace(/ Metro$/, "").replace(/^San Francisco$/, "San Francisco Bay Area")];
  if (!scene) {
    return <span aria-hidden="true" className="absolute inset-0 rounded-lg overflow-hidden bg-[#e8f1f5]/60"><svg viewBox="0 0 260 80" preserveAspectRatio="xMidYMid slice" className="w-full h-full"><path d="M0 62Q65 36 121 57T260 42" fill="none" stroke="#a9c2d1" strokeWidth="8"/><path d="M0 78Q87 40 165 61T260 50" fill="none" stroke="#7197b0" strokeWidth="3" strokeDasharray="8 8"/></svg></span>;
  }
  return <span aria-hidden="true" className="absolute inset-0 rounded-lg overflow-hidden bg-gradient-to-r from-[#f8fbfc] to-[#e8f2f7]"><svg viewBox="0 0 260 80" preserveAspectRatio="xMidYMid slice" className="w-full h-full"><path d={scene.far} fill="#b7ccd9"/><path d={scene.near} fill="#7399b1"/>{scene.detail && <path d={scene.detail} fill="none" stroke="#497c9b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}<path d="M0 72Q78 66 130 71T260 69v11H0" fill="#bed2dc" opacity=".7"/></svg><span className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/50 to-white/5"/></span>;
}
