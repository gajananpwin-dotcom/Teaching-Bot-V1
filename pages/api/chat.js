import OpenAI from "openai";
import { containsBadLanguage, isOnSubject, languageHeader } from "../../lib/guard";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { message, subject, keywords = [], language = "en" } = req.body || {};
  if (!message || !subject) return res.status(400).json({ error: "Provide message and subject" });

  if (containsBadLanguage(message)) {
    return res.json({ reply: "Let’s keep our conversation respectful. Please rephrase your question." });
  }
  if (!isOnSubject(message, keywords)) {
    return res.json({ reply: "Let’s stay on the uploaded subject. Ask me something from your syllabus or current module." });
  }
  if (!client) return res.json({ reply: `Stub: ${message} (add OPENAI_API_KEY for real tutoring in ${language})` });

  const sys = [
    "You are TBv1, a polite, strict subject tutor.",
    "Rules:",
    "- Discuss ONLY the given subject; refuse unrelated topics.",
    "- No profanity; de-escalate if user is rude.",
    "- Keep answers concise, stepwise and example-driven.",
    languageHeader(language)
  ].join("\n");

  const user = `SUBJECT: ${subject}\n\nStudent question:\n${message}\n\nIf unrelated, politely redirect to subject.`;

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    });
    const reply = resp.choices?.[0]?.message?.content?.trim() || "I’m here to help with the subject you uploaded.";
    return res.json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Chat failed" });
  }
}
