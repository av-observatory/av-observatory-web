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
