import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function TBv1() {
  const [sessionId, setSessionId] = useState(null);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("en");
  const [syllabusText, setSyllabusText] = useState("");
  const [gen, setGen] = useState(null);
  const [loading, setLoading] = useState(false);

  const [chatMsg, setChatMsg] = useState("");
  const [chatLog, setChatLog] = useState([]);

  // ------------- Load or create session on first visit -------------
  useEffect(() => {
    (async () => {
      let sid = localStorage.getItem("tbv1.sessionId");
      if (!sid) { sid = uuid(); localStorage.setItem("tbv1.sessionId", sid); }
      setSessionId(sid);

      // Try load existing
      const { data: ses } = await supabase.from("sessions").select("*").eq("id", sid).maybeSingle();
      if (ses) {
        setSubject(ses.subject); setLanguage(ses.language);
        const { data: syl } = await supabase.from("syllabus").select("*").eq("session_id", sid).maybeSingle();
        if (syl?.text) setSyllabusText(syl.text);

        const { data: mat } = await supabase.from("materials").select("*").eq("session_id", sid).maybeSingle();
        if (mat?.pack) setGen(mat.pack);

        const { data: msgs } = await supabase.from("messages").select("*").eq("session_id", sid).order("created_at", { ascending: true });
        if (msgs?.length) setChatLog(msgs.map(m => ({ who: m.role === "user" ? "you" : "tbv1", text: m.content })));
      }
    })();
  }, []);

  // ------------- Helpers to persist -------------
  async function ensureSession() {
    if (!sessionId) return;
    const { data: existing } = await supabase.from("sessions").select("id").eq("id", sessionId).maybeSingle();
    if (!existing) await supabase.from("sessions").insert({ id: sessionId, subject, language });
    else await supabase.from("sessions").update({ subject, language }).eq("id", sessionId);
  }

  async function saveSyllabus(keywords = []) {
    if (!sessionId) return;
    await ensureSession();
    await supabase.from("syllabus").upsert({ session_id: sessionId, text: syllabusText, keywords, updated_at: new Date().toISOString() });
  }

  async function savePack(pack) {
    if (!sessionId) return;
    await ensureSession();
    await supabase.from("materials").upsert({ session_id: sessionId, pack, updated_at: new Date().toISOString() });
  }

  async function addMessage(role, content) {
    if (!sessionId) return;
    await supabase.from("messages").insert({ session_id: sessionId, role, content });
  }

  // ------------- UI actions -------------
  async function onUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert("Max 2 MB for MVP");
    const reader = new FileReader();
    reader.onload = () => setSyllabusText(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function generateAll() {
    if (!subject || !syllabusText) return alert("Fill subject and syllabus first.");
    setLoading(true);
    try {
      const r = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, syllabusText, language })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setGen(data);
      await ensureSession();
      await saveSyllabus(data.keywords || []);
      await savePack(data);
    } catch (e) {
      alert(e.message || "Failed to generate");
    } finally { setLoading(false); }
  }

  async function ask() {
    if (!chatMsg.trim() || !gen) return;
    const msg = chatMsg.trim();
    setChatMsg(""); setChatLog(l => [...l, { who:"you", text: msg }]); await addMessage("user", msg);

    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, subject, keywords: gen.keywords, language })
      });
      const data = await r.json();
      const reply = data.reply || "(no reply)";
      setChatLog(l => [...l, { who:"tbv1", text: reply }]);
      await addMessage("tbv1", reply);
    } catch {
      setChatLog(l => [...l, { who:"tbv1", text: "Chat failed." }]);
    }
  }

  async function resetSession() {
    const sid = uuid(); localStorage.setItem("tbv1.sessionId", sid); setSessionId(sid);
    setSubject(""); setLanguage("en"); setSyllabusText(""); setGen(null); setChatLog([]);
    await supabase.from("sessions").insert({ id: sid, subject: "", language: "en" });
  }

  const canDownload = useMemo(() => !!gen?.slides?.length, [gen]);

  return (
    <div className="container">
      <h1 style={{marginBottom:8}}>TBv1 · Teaching Bot (Stored Sessions)</h1>
      <div className="card">
        <div className="row row-3">
          <div>
            <label>Subject</label>
            <input className="input" placeholder="e.g., Thermodynamics" value={subject} onChange={e=>setSubject(e.target.value)} />
          </div>
          <div>
            <label>Language</label>
            <select className="select" value={language} onChange={e=>setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">Hindi (हिंदी)</option>
              <option value="mixed">Mixed (Hinglish)</option>
            </select>
            <div className="badge" style={{marginTop:6}}>Clean language · Subject-only</div>
          </div>
          <div>
            <label>Upload Syllabus (.txt for MVP)</label>
            <input className="input" type="file" accept=".txt,.md,text/plain" onChange={onUpload} />
          </div>
        </div>

        <label style={{marginTop:10}}>Or paste syllabus text</label>
        <textarea className="textarea" rows={8} placeholder="Paste your syllabus here…" value={syllabusText} onChange={e=>setSyllabusText(e.target.value)} />

        <div style={{display:"flex", gap:10, marginTop:10}}>
          <button className="btn" onClick={generateAll} disabled={loading}>{loading ? "Generating…" : "Generate Course Pack"}</button>
          <button className="btn" onClick={async () => {
            if (!canDownload) return alert("No slides yet.");
            const r = await fetch("/api/ppt", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ slides: gen.slides, fileName: `${subject.replace(/\W+/g,'_')}-TBv1` }) });
            if (!r.ok) return alert("PPT build failed");
            const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
            a.href = url; a.download = `${subject.replace(/\W+/g,'_')}-TBv1.pptx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          }} disabled={!canDownload}>Download PPT</button>
          <button className="btn" style={{background:"#ef4444"}} onClick={resetSession}>Reset Session</button>
        </div>
      </div>

      {gen && (
        <>
          <div className="card" style={{marginTop:14}}>
            <h3>Course Outline</h3>
            <ul className="list">{(gen.outline || []).map((o,i)=><li key={i}>{o}</li>)}</ul>
          </div>

          <div className="card" style={{marginTop:14}}>
            <h3>Notes</h3>
            <div style={{whiteSpace:"pre-wrap"}}>{gen.notes}</div>
          </div>

          <div className="card" style={{marginTop:14}}>
            <h3>Numericals / Practice with Solutions</h3>
            <ol className="list">
              {(gen.problems || []).map((p,i)=>(
                <li key={i}><b>Q:</b> {p.q}<br/><b>Ans:</b> <span style={{whiteSpace:"pre-wrap"}}>{p.a}</span></li>
              ))}
            </ol>
          </div>

          <div className="card" style={{marginTop:14}}>
            <h3>Slide Plan</h3>
            <ol className="list">
              {(gen.slides || []).map((s,i)=>(
                <li key={i}><b>{s.title}</b><ul className="list">{(s.bullets||[]).map((b,j)=><li key={j}>{b}</li>)}</ul></li>
              ))}
            </ol>
          </div>

          <div className="card" style={{marginTop:14}}>
            <h3>Chat with TBv1 (stored)</h3>
            <div className="mono" style={{background:"#f1f5f9", padding:10, borderRadius:10, minHeight:120}}>
              {chatLog.map((m,i)=>(
                <div key={i} style={{margin:"6px 0"}}><b>{m.who==="you"?"You":"TBv1"}:</b> {m.text}</div>
              ))}
            </div>
            <div style={{display:"flex", gap:8, marginTop:8}}>
              <input className="input" placeholder="Ask from your syllabus…" value={chatMsg} onChange={e=>setChatMsg(e.target.value)} />
              <button className="btn" onClick={ask} disabled={!gen}>Ask</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
