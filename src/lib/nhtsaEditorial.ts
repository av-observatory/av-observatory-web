/** One uniform presentation guard for both site snapshots and live R2 data. */
const replacements: Array<[RegExp,string]> = [
  [/\bODI\b/g, "NHTSA"],
  [/\bADS\b/g, "automated driving system"],
  [/\bADAS\b/g, "driver-assistance system"],
  [/\bAVs\b/g, "automated vehicles"],
  [/\bAV\b/g, "automated vehicle"],
  [/\bFMVSS\b/g, "federal vehicle safety standards"],
  [/\bFSD\b/g, "Full Self-Driving"],
  [/\bSGO\b/g, "NHTSA crash-reporting"],
];
function plain(value: string) {
  let text=value.replace(/https?:\/\/\S+/g,"").replace(/\b\d{5}-\d{4,}(?:-\d+)*\b/g,"");
  for(const [pattern,replacement] of replacements) text=text.replace(pattern,replacement);
  return text.replace(/\s+/g," ").trim();
}
const wordCount=(s:string)=>s.split(/\s+/).filter(Boolean).length;
const boilerplate=/report id|listed below|office of defects investigation has received|in order to determine|this will include an assessment|if additional evidence/i;
export function nhtsaCardSummary(raw:string,subject:string,kind:"investigation"|"recall") {
  const cleaned=plain(raw||"");
  if(cleaned && cleaned.length<=380 && wordCount(cleaned)<=58 && !boilerplate.test(cleaned))
    return cleaned;
  const candidate=cleaned.split(/(?<=[.!?])\s+(?=[A-Z])/)
    .find(s=>s.length>=35 && s.length<=300 && wordCount(s)<=48 && !boilerplate.test(s));
  if(candidate) return candidate;
  const topic=plain(subject||"automated-driving safety").slice(0,150).replace(/[.,;: ]+$/,"");
  return kind==="investigation"
    ? `NHTSA is investigating reports involving ${topic.toLowerCase()}. See the official record for the investigation's scope.`
    : `The recall concerns ${topic.toLowerCase()}. See the official campaign record for the safety risk and remedy.`;
}
export function nhtsaCompany(company:string, product:string, subject:string) {
  if(company && company!=="Other AV / ADAS") return company;
  const haystack=`${product} ${subject}`.toLowerCase();
  for(const name of ["Avride","Waymo","Zoox","Cruise","Tesla","Nuro","Motional","Aurora","May Mobility","Gatik","Kodiak","Wayve"]) {
    if(haystack.includes(name.toLowerCase())) return name;
  }
  return company;
}

const TITLE_MAX=100; // about two lines at the card's title size
/** Subjects cut at 140 chars by the source refresh are NHTSA's opening sentence, not a headline. */
function looksTruncated(subject:string){ return subject.length>=130 && !/[.!?]$/.test(subject.trim()); }
function clip(text:string,max:number){
  if(text.length<=max) return text;
  const andAt=text.slice(0,max).lastIndexOf(" and ");
  if(andAt>=30) return text.slice(0,andAt);
  const comma=text.slice(0,max).lastIndexOf(", ");
  if(comma>=30) return text.slice(0,comma);
  return text.slice(0,max).replace(/\s+\S*$/,"").replace(/[,;:\s]+$/,"")+"…";
}
/**
 * Short card headline. Reviewed subjects pass through; a cut-off subject becomes the
 * hazard clause of the source text ("Software may allow the vehicle to enter a closed
 * freeway construction zone") so the title fits on one or two lines and the detail
 * below does not open by repeating the same sentence.
 */
export function nhtsaCardTitle(subject:string,detail?:string){
  const s=(subject||"").trim();
  if(!looksTruncated(s)) return s;
  const sentences=(detail||s).replace(/https?:\/\/\S+/g,"").split(/(?<=[.!?])\s+(?=[A-Z])/).map(x=>x.trim()).filter(Boolean);
  const hazard=sentences.find(x=>!/\bis recalling\b/i.test(x)&&x.length>=25);
  const base=hazard ?? (sentences[0]??s).replace(/^.*?\)?\s+is recalling\s+/i,"Recall of ");
  const text=base.replace(/^the\s+/i,"").replace(/[.\s]+$/,"");
  return clip(text.charAt(0).toUpperCase()+text.slice(1),TITLE_MAX);
}
