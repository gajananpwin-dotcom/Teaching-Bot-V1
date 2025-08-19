import PptxGenJS from "pptxgenjs";
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { slides = [], fileName = "TBv1-slides" } = req.body || {};
  try {
    const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_16x9";
    slides.slice(0, 20).forEach(sl => {
      const s = pptx.addSlide();
      s.addText(sl.title || "Slide", { x:0.5, y:0.3, w:9, h:0.8, fontSize:28, bold:true });
      (sl.bullets || []).slice(0, 8).forEach((b,i)=> s.addText(`• ${b}`, { x:0.7, y:1.2 + i*0.5, w:9, h:0.5, fontSize:18 }));
    });
    const b64 = await pptx.write("base64");
    const buf = Buffer.from(b64, "base64");
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pptx"`);
    return res.send(buf);
  } catch (e) {
    console.error(e); return res.status(500).json({ error: "PPT build failed" });
  }
}
