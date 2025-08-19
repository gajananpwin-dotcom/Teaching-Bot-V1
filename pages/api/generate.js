import OpenAI from "openai";
import { containsBadLanguage, extractKeywords, languageHeader } from "../../lib/guard";
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { subject, syllabusText, language = "en" } = req.body || {};
  if (!subject || !syllabusText) return res.status(400).json({ error: "Provide subject and syllabusText" });
  if (containsBadLanguage(syllabusText) || containsBadLanguage(subject)) return res.status(400).json({ error: "Inappropriate content detected in syllabus/subject." });

  const sys = [
    "You are TBv1, a strict subject tutor.",
    "Rules:",
    "- Only talk about the uploaded subject.",
    "- No profanity or insults; stay respectful.",
    "- Output must follow the requested language mode.",
    "- Create helpful material for beginners to intermediate learners.",
    "- Include worked numericals with clear stepwise solutions where applicable.",
    languageHeader(language)
  ].join("\n");

  const user = `
SUBJECT: ${subject}

SYLLABUS (verbatim):
${syllabusText}

Tasks:
1) Course Outline (modules → topics → outcomes) compact.
2) Notes (succinct, bullet learning notes) ~800–1200 words.
3) 10 Numericals with fully worked solutions (where subject fits; else give 10 practice Q&A).
4) Slide Plan: 10–14 slides. Each slide = Title + 4–6 bullets (no styling).
Language mode: ${language}.
Return JSON with keys: outline, notes, problems, slides.
`;

  try {
    if (!client) {
      return res.json({
        outline: [`Intro to ${subject}`, "Key Concepts", "Applications", "Revision"],
        notes: `Sample notes for ${subject}. (Add your OpenAI key to generate full content.)`,
        problems: [{ q: `Sample question in ${subject}`, a: "Sample solution" }],
        slides: [
          { title: `About ${subject}`, bullets: ["Definition", "Why it matters", "Where it's used"] },
          { title: "Core Ideas", bullets: ["Idea 1", "Idea 2", "Idea 3"] }
        ],
        keywords: extractKeywords(syllabusText)
      });
    }

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" }
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let data = {}; try { data = JSON.parse(raw); } catch {}
    data.keywords = extractKeywords(syllabusText);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Generation failed" });
  }
}
