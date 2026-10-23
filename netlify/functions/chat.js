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

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    });
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("").trim();
    if (!res.ok || !text) {
      return { statusCode: 502, body: JSON.stringify({ error: (data.error && data.error.message) || "AI хариулсангүй" }) };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "Gemini-тэй холбогдож чадсангүй" }) };
  }
};
