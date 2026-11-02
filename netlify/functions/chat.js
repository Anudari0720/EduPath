// EduPath - AI чатботын сервер функц (Netlify дээр ажиллана)
// Gemini-ийн түлхүүр Netlify-ийн нууц тохиргоонд (GEMINI_API_KEY) хадгалагдана.

exports.handler = async (event) => {
  // Хөтөчөөр нээвэл аль хувилбар ажиллаж байгааг харуулна
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ version: "chat v4", key: Boolean(process.env.GEMINI_API_KEY) }) };
  }
  console.log("chat v4 эхэллээ");

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY тохируулаагүй байна" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Буруу хүсэлт" }) };
  }
  const system = String(body.system || "").slice(0, 8000);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 2000) }],
  }));
  if (contents.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Асуулт хоосон байна" }) };
  }

  // Нэг загвар удаан/ажиллахгүй бол дараагийнхыг оролдоно (Netlify 30 секундэд тасалдаг)
  const models = [
    { name: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", wait: 12000 },  // хамгийн хурдан
    { name: "gemini-3.6-flash", wait: 12000 },                                  // нөөц
  ];
  const systemText = system + "\nХариултаа товч, 3-5 өгүүлбэрт багтаа.";
  let lastError = "AI хариулсангүй";

  for (const m of models) {
    const thinkingConfig = { thinkingLevel: "minimal" };   // бараг бодохгүй, шууд хариулна
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), m.wait);
    const started = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { thinkingConfig, maxOutputTokens: 800 },
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.map((p) => p.text || "").join("").trim();
      console.log(`${m.name}: ${res.status}, ${Date.now() - started} ms`);
      if (res.ok && text) {
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
      }
      lastError = (data.error && data.error.message) || "AI хариулсангүй";
      console.log(`${m.name} алдаа: ${lastError}`);
    } catch (e) {
      lastError = e.name === "AbortError" ? `${m.name} хэт удаан хариулсан` : "Gemini-тэй холбогдож чадсангүй";
      console.log(`${m.name} алдаа: ${lastError} (${Date.now() - started} ms)`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { statusCode: 502, body: JSON.stringify({ error: lastError }) };
};
