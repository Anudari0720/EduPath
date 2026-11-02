// EduPath - AI чатботын сервер функц (Netlify дээр ажиллана)
// Вэб хуудас асуултаа энд илгээнэ -> энэ функц Gemini AI-аас асууж -> хариултыг буцаана.
// Gemini-ийн түлхүүр Netlify-ийн нууц тохиргоонд (GEMINI_API_KEY) хадгалагдана,
// тиймээс хуудсыг үзсэн хэн ч түлхүүрийг харж чадахгүй.

exports.handler = async (event) => {
  // Зөвхөн POST хүсэлт хүлээж авна
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST хүсэлт явуулна уу" }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY тохируулаагүй байна" }) };
  }

  // Хуудаснаас ирсэн мэдээлэл: сурагчийн мэдээлэл (system) ба яриа (messages)
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Буруу хүсэлт" }) };
  }
  const system = String(body.system || "").slice(0, 8000);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

  // Gemini-ийн хүлээн авдаг хэлбэрт оруулах (assistant -> model)
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 2000) }],
  }));
  if (contents.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Асуулт хоосон байна" }) };
  }

  // Нэг загвар удаан/ажиллахгүй бол дараагийнхыг оролдоно.
  // Netlify 30 секундэд тасалдаг тул загвар бүрт хугацааны хязгаар тавина.
  const models = [
    { name: process.env.GEMINI_MODEL || "gemini-3.8-flash", wait: 10000 },
    { name: "gemini-2.5-flash", wait: 15000 },
  ];
  const systemText = system + "\nХариултаа товч, 3-5 өгүүлбэрт багтаа.";
  let lastError = "AI хариулсангүй";

  for (const m of models) {
    // Gemini 3+ загварт thinkingLevel, 2.5 загварт thinkingBudget хэрэглэнэ
    const thinkingConfig = m.name.startsWith("gemini-2") ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
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
