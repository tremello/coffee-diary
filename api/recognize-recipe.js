// Reads a photo of a pour-over recipe (printed card, screenshot, handwritten note) into the 나의 레시피 form.
// Same login check and limits as recognize-bean.js; a single read, since a recipe is short text and
// the user waits on it.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
let thinkingLevel = process.env.GEMINI_THINKING_LEVEL || "minimal";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ghpiixyzxeqvdkwostcb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_dbXp4bFaIdFgjjKP6vUsOg_kd9Ss5g3";
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);

const ACTIONS = ["블룸", "센터 푸어", "원형 푸어", "마무리", "가수", "없음"];
// The form allows 6 pours plus the bloom for a basic recipe, 9 steps for an immersion (switch) one.
const MAX_STEPS = { basic: 7, immersion: 9 };
const MAX_OUTPUT_TOKENS = 2048;

const recipeSchema = {
  type: "object",
  properties: {
    isRecipe: { type: "boolean", description: "사진에 커피 추출 레시피가 있으면 true" },
    name: { type: "string", description: "레시피 이름. 예: 4:6 레시피, 테츠 카스야" },
    coffee: { type: "number", description: "원두 양(g) 숫자만. 예: 20" },
    immersion: { type: "boolean", description: "스위치·밸브를 닫고 여는 침출식 레시피면 true" },
    steps: {
      type: "array",
      description: "붓기·스위치 단계를 시간 순서대로",
      items: {
        type: "object",
        properties: {
          time: { type: "string", description: "시작 시간 m:ss. 예: 0:00, 1:30" },
          action: { type: "string", enum: ACTIONS },
          amount: { type: "number", description: "이 단계에서 붓는 물(g). 모르면 0" },
          total: { type: "number", description: "레시피에 적힌 누적 물 양(g). 없으면 0" },
          switch: { type: "string", enum: ["", "닫고", "열고"] }
        },
        required: ["time", "action"]
      }
    },
    memo: { type: "string", description: "물 온도·분쇄도·드리퍼·비율 등 단계 밖의 정보, 짧게. 예: 92℃ · 분쇄 중간 · V60" }
  }
};

const PROMPT = `# 커피 레시피 읽기

사진은 핸드드립(푸어오버) 커피 레시피입니다. 인쇄된 카드, 앱 화면 캡처, 손글씨 메모일 수 있습니다. 아래 양식에 맞춰 JSON으로 답하세요.

## 규칙
- 사진에 적힌 내용만 씁니다. 없는 값은 비우거나 0으로 둡니다. 레시피가 아니면 isRecipe를 false로 둡니다.
- name: 레시피 이름이 있으면 그대로. 없으면 비웁니다.
- coffee: 원두 양 g. "20g", "원두 20" → 20.
- steps: 시간 순서대로 한 단계씩. 첫 단계는 0:00.
  - time: m:ss. "30s", "0'30\\"", "30초" → 0:30. "1분 45초" → 1:45. 시간이 범위면("0:45~1:10") 시작 시간.
  - action: 첫 뜸 들이기(bloom, 뜸, 프리인퓨전)는 "블룸". 가운데만 붓기는 "센터 푸어". 그 밖에 붓기는 "원형 푸어". 추출 끝·드로다운 완료·서버 제거 시간은 "마무리"(붓는 양 0). 추출 후 서버에 물을 더하는 가수(bypass)는 "가수". 스위치만 조작하고 붓지 않는 단계는 "없음".
  - amount: 이 단계에서 붓는 양 g. total: 레시피에 "~까지", "누적", "→ 120g"처럼 누적으로 적혀 있으면 그 값. 둘 중 적힌 것만 채워도 됩니다.
  - 물 양이 비율로만 적혀 있으면(예: 원두 20g, 1:15, 5번 나눠 붓기) 원두 양으로 g를 계산합니다.
  - switch: 스위치·밸브·클레버를 이 단계에서 닫으면 "닫고", 열면 "열고", 그대로면 "".
  - 추출 종료 시간("총 3:00", "drawdown 3:30")이 적혀 있으면 마지막에 "마무리" 단계로 넣습니다.
- immersion: 스위치를 닫고 여는 단계가 있으면 true.
- memo: 물 온도, 분쇄도, 드리퍼, 필터, 비율처럼 단계 밖에 적힌 정보를 " · "로 이어 짧게(80자 이내). 없으면 비웁니다.`;

async function verifyUser(request) {
  const header = request.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!authResponse.ok) return null;
  const user = await authResponse.json();
  return user?.id ? user : null;
}

function getBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

function errorMessage(payload) {
  return payload?.error?.message || "Gemini가 사진을 읽지 못했어요. 잠시 후 다시 시도해주세요.";
}

function interactionText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return payload?.steps
    ?.filter(step => step?.type === "model_output")
    .flatMap(step => step.content ?? [])
    .filter(content => content?.type === "text" && typeof content.text === "string")
    .map(content => content.text)
    .join("") ?? "";
}

const positive = value => {
  const number = typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : 0;
};

// "1:30", "1'30\"", "90s", "1분 30초" → seconds; null when unreadable.
export function timeToSeconds(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{1,2})\s*[:'′분]\s*(\d{1,2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = text.match(/^(\d{1,2})\s*분/);
  if (match) return Number(match[1]) * 60;
  match = text.match(/^(\d{1,4})\s*(s|sec|초)?$/i);
  if (match) return Number(match[1]);
  return null;
}

const mss = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// Turns Gemini's answer into steps the editor accepts: m:ss times in order, each pour's own amount
// (worked out from the running total when only that was written), the step limit, at least two steps.
export function normalizeRecipe(raw) {
  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  let previousTotal = 0;
  let lastSeconds = -5;
  const steps = [];
  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== "object") continue;
    const action = ACTIONS.includes(rawStep.action) ? rawStep.action : "원형 푸어";
    const switchMove = rawStep.switch === "닫고" || rawStep.switch === "열고" ? rawStep.switch : undefined;
    let seconds = steps.length === 0 ? 0 : timeToSeconds(rawStep.time);
    // Untimed or out-of-order steps keep their order, 5 s after the one before (the editor's minimum gap).
    if (seconds === null || seconds < lastSeconds + 5) seconds = lastSeconds + 5;
    let amount = positive(rawStep.amount);
    const total = positive(rawStep.total);
    if (action === "가수") {
      // Bypass water isn't part of the running total.
    } else if (action === "마무리" || action === "없음") {
      amount = 0;
    } else {
      if (!amount && total > previousTotal) amount = Math.round((total - previousTotal) * 10) / 10;
      previousTotal = total > previousTotal ? total : previousTotal + amount;
    }
    if (action === "없음" && !switchMove) continue;
    steps.push({ time: mss(seconds), action, amount, ...(switchMove ? { switch: switchMove } : {}) });
    lastSeconds = seconds;
  }
  const immersion = Boolean(raw?.immersion) || steps.some(step => step.switch);
  // Keep only switch moves that change it (the switch starts open), so the editor's line matches.
  let closed = false;
  for (const step of steps) {
    if (!immersion || (step.switch === "닫고") === closed) delete step.switch;
    else closed = step.switch === "닫고";
  }
  const visible = immersion ? steps : steps.filter(step => step.action !== "없음");
  const limit = immersion ? MAX_STEPS.immersion : MAX_STEPS.basic;
  // Over the limit, keep the first pours and the closing 마무리 so the brew time survives.
  let trimmed = visible;
  if (visible.length > limit) {
    const last = visible[visible.length - 1];
    trimmed = last.action === "마무리" ? [...visible.slice(0, limit - 1), last] : visible.slice(0, limit);
  }
  while (trimmed.length > 0 && trimmed.length < 2) trimmed.push({ time: mss(timeToSeconds(trimmed[trimmed.length - 1].time) + 30), action: "원형 푸어", amount: 0 });
  if (trimmed[0]) trimmed[0].time = "0:00";

  const text = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return {
    name: text(raw?.name, 40),
    coffee: positive(raw?.coffee),
    immersion,
    steps: trimmed,
    memo: text(raw?.memo, 120),
    trimmed: visible.length - trimmed.length > 0
  };
}

async function readRecipe(base64, mimeType) {
  const level = thinkingLevel;
  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [
        // Recipe text is larger than label small print, so high (not ultra_high) keeps the image cheaper to read.
        { type: "image", mime_type: mimeType, data: base64, resolution: "high" },
        { type: "text", text: PROMPT }
      ],
      response_format: { type: "text", mime_type: "application/json", schema: recipeSchema },
      generation_config: { thinking_level: level, max_output_tokens: MAX_OUTPUT_TOKENS },
      store: false
    })
  });
  const payload = await geminiResponse.json();
  if (geminiResponse.status === 400 && level !== "low" && /thinking/i.test(errorMessage(payload))) {
    thinkingLevel = "low";
    return readRecipe(base64, mimeType);
  }
  if (!geminiResponse.ok) return { status: geminiResponse.status, error: errorMessage(payload) };
  try {
    return { raw: JSON.parse(interactionText(payload)) };
  } catch {
    return { raw: null };
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 사용할 수 있어요." });
  }

  let user = null;
  try {
    user = await verifyUser(request);
  } catch (error) {
    console.error("Login check failed", error instanceof Error ? error.message : "unknown error");
  }
  if (!user) return response.status(401).json({ error: "사진 인식은 Google 로그인 후 사용할 수 있어요." });
  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(String(user.email ?? "").toLowerCase())) {
    return response.status(403).json({ error: "이 계정은 사진 인식을 사용할 수 없어요." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return response.status(503).json({ error: "Gemini API 키를 연결한 뒤 사진 인식을 사용할 수 있어요." });
  }

  try {
    const { image, mimeType } = getBody(request);
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return response.status(400).json({ error: "사진 파일을 다시 선택해주세요." });
    }
    if (!SUPPORTED_TYPES.has(mimeType)) {
      return response.status(400).json({ error: "JPG, PNG, WebP, HEIC 사진만 사용할 수 있어요." });
    }
    const base64 = image.split(",")[1] ?? "";
    if (Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES) {
      return response.status(413).json({ error: "사진은 3MB 이하로 줄여서 보내주세요." });
    }

    const started = Date.now();
    const read = await readRecipe(base64, mimeType);
    const elapsed = Date.now() - started;
    console.log(`Recipe photo read in ${elapsed}ms (thinking ${thinkingLevel}, ${Math.round(base64.length / 1024)}KB)`);
    response.setHeader("Server-Timing", `gemini;dur=${elapsed}`);
    if (read.error) return response.status(read.status).json({ error: read.error });

    const recipe = read.raw && read.raw.isRecipe !== false ? normalizeRecipe(read.raw) : null;
    const pours = recipe?.steps.filter(step => step.amount > 0).length ?? 0;
    if (!recipe || (!recipe.coffee && pours === 0)) return response.status(422).json({ error: "사진에서 레시피를 찾지 못했어요." });
    return response.status(200).json({ recipe });
  } catch (error) {
    console.error("Recipe photo recognition failed", error instanceof Error ? error.message : "unknown error");
    return response.status(500).json({ error: "사진을 읽는 중 문제가 생겼어요. 사진을 다시 찍어보세요." });
  }
}
