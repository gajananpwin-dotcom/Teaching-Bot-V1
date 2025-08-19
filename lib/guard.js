export const BAD_WORDS = ["fuck","shit","bitch","bastard","asshole","dick","cunt","slut","rape","porn","nude"];

export function containsBadLanguage(text = "") {
  const t = (text || "").toLowerCase();
  return BAD_WORDS.some(w => t.includes(w));
}

export function extractKeywords(syllabus = "", max = 80) {
  const stop = new Set(("a,an,the,of,and,or,to,in,on,for,by,with,from,as,at,is,are,was,were,be,been,that,this,these,those,which,who,whom,whose,into,than,then,it,its,not,do,does,did,can,could,should,would,may,might,will,shall,has,have,had,over,under,between,within,about,across,into,out,if,else,when,while,also,more,most,less,least,very,so,such,per,each,via,using,including,eg,ie,vs").split(","));
  const counts = new Map();
  (syllabus || "").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w && w.length > 2 && !stop.has(w)).forEach(w => counts.set(w,(counts.get(w)||0)+1));
  return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,max).map(([w])=>w);
}

export function isOnSubject(message = "", subjectWords = []) {
  const msg = (message || "").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean);
  const setMsg = new Set(msg), setSub = new Set(subjectWords);
  let inter = 0; for (const w of setMsg) if (setSub.has(w)) inter++;
  const jaccard = inter / (setMsg.size + setSub.size - inter || 1);
  return jaccard >= 0.02 || inter >= 3;
}

export function languageHeader(mode = "en") {
  if (mode === "hi") return "भाषा: हिंदी (साफ़ और विनम्र)";
  if (mode === "mixed") return "Language: Hinglish (clear and polite; English + Hindi mixed)";
  return "Language: English (clear and polite)";
}
