// Vercel caps request bodies at 4.5MB; 3MB of image is about 4MB once base64-encoded.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Same publishable project credentials as src/supabase.ts; only used to verify the caller's login.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ghpiixyzxeqvdkwostcb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_dbXp4bFaIdFgjjKP6vUsOg_kd9Ss5g3";
// Optional comma-separated list of Google emails allowed to use photo recognition.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);

const beanSchema = {
  type: "object",
  properties: {
    origin: { type: "string", description: "원산지 국가명(한국어). 예: 에티오피아, 콜롬비아" },
    farm: { type: "string", description: "농장·워싱스테이션·지역명(한국어 표기). 여러 개면 쉼표로 구분" },
    variety: { type: "string", description: "품종. 봉투 원문 표기 유지. 예: Gesha, Heirloom" },
    process: { type: "string", description: "가공 방식. 워시드, 내추럴, 허니, 무산소 내추럴, 무산소 워시드 중 하나를 우선 사용" },
    roastery: { type: "string", description: "로스터리 또는 판매처 이름. 로고에 적힌 원문 표기 유지" },
    roasteryNotes: { type: "string", description: "봉투에 적힌 컵노트·향미 표현(한국어). 쉼표로 구분" },
    purchased: { type: "number", description: "원두 무게(g) 숫자만. 예: 200g은 200, 1kg은 1000" },
    roastDate: { type: "string", description: "로스팅 날짜 YYYY-MM-DD. 연·월·일이 모두 보일 때만" },
    price: { type: "number", description: "가격(원) 숫자만. 예: 18,000원은 18000" }
  }
};
const BEAN_FIELDS = Object.keys(beanSchema.properties);
beanSchema.properties.notOnLabel = {
  type: "array",
  items: { type: "string", enum: BEAN_FIELDS },
  description: "라벨 전체를 확인했지만 적혀 있지 않은 항목 이름"
};
// Gemini sometimes skips fields it read fine on another run, so read again when this many are
// missing without Gemini saying the label doesn't show them. Some labels just lack the info,
// so the number of extra reads is capped.
const RETRY_WHEN_UNEXPLAINED = 2;
const MAX_RETRIES = 1;
// A normal answer is a few hundred tokens; the cap stops a runaway answer (e.g. endless
// footnote markers) from keeping the user waiting. Reading a label needs little reasoning,
// and low thinking keeps thinking tokens well under the cap.
const MAX_OUTPUT_TOKENS = 2048;
const MAX_TEXT_LENGTH = 200;

const PROMPT = `이 사진은 커피 원두 봉투 라벨입니다. 라벨에 적힌 정보를 아래 항목별로 추출하세요.

먼저 사진 전체를 꼼꼼히 훑어보세요. 작은 글씨, 봉투 옆면·뒷면, 붙어 있는 스티커, 손글씨, 도장(로스팅 날짜가 찍혀 있는 경우가 많음)까지 모두 확인합니다. 영어·한국어·일본어 등 어떤 언어로 적혀 있어도 읽습니다.

- roastery: 로스터리·판매처 이름. 로고나 브랜드명 원문 표기를 그대로 씁니다.
- origin: 원산지 국가를 한국어 국가명으로 씁니다(Ethiopia→에티오피아, Panama→파나마, Colombia→콜롬비아, Kenya→케냐). 국가 대신 지역명만 적혀 있어도 그 지역이 속한 국가가 확실하면 국가명을 씁니다(예: Yirgacheffe→에티오피아).
- farm: 농장·워싱스테이션·생산자·지역명을 자연스러운 한국어 음역 또는 통용 한국어 표기로 씁니다(El Vergel→엘 베르헬).
- variety: 품종 원문 표기를 그대로 씁니다(Gesha, Heirloom, Pink Bourbon 등).
- process: 가공 방식. 가능하면 워시드, 내추럴, 허니, 무산소 내추럴, 무산소 워시드 중 하나로 씁니다(Washed→워시드, Natural→내추럴, Anaerobic Natural→무산소 내추럴).
- roasteryNotes: 컵노트·테이스팅 노트·향미 표현을 한국어 맛 표현으로 바꿔 쉼표로 나눕니다.
- purchased: 원두 무게를 g 단위 숫자로만 씁니다(200g→200, 1kg→1000).
- roastDate: 로스팅 날짜를 YYYY-MM-DD로 씁니다(2026.10.20, 20/10/2026, 26.10.20 등도 변환). 연·월·일 중 하나라도 알 수 없으면 생략합니다. 유통기한·포장일로 명시된 날짜는 로스팅 날짜로 쓰지 않습니다.
- price: 가격을 원 단위 숫자로만 씁니다(18,000원→18000).

라벨에 실제로 적힌 내용만 쓰고, 적혀 있지 않은 정보를 추측해서 만들지 마세요. 하지만 글씨가 작거나 흐려도 읽을 수 있다면 생략하지 말고 채워주세요. 라벨에서 찾을 수 없는 항목만 생략합니다. 값에는 라벨 내용만 쓰고 각주·출처 표시([^1] 같은 것)는 절대 붙이지 마세요.

원두 봉투에는 원래 일부 정보가 없는 경우가 많습니다(예: 가격이나 로스팅 날짜가 없는 라벨). 사진 전체를 확인했는데도 라벨에 적혀 있지 않은 항목은 notOnLabel에 그 항목 이름을 넣어 "없음"으로 판단해주세요. 글씨가 가려지거나 잘려서 확인할 수 없는 항목은 notOnLabel에 넣지 마세요.`;

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

function filledValue(value) {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return false;
}

function missingFields(bean) {
  return BEAN_FIELDS.filter(field => !filledValue(bean[field]));
}

// Missing fields that Gemini didn't explicitly judge as absent from the label.
function unexplainedMissing(bean, notOnLabel) {
  return missingFields(bean).filter(field => !notOnLabel.includes(field));
}

function labelFields(bean) {
  const { notOnLabel, ...fields } = bean;
  return { fields, notOnLabel: Array.isArray(notOnLabel) ? notOnLabel : [] };
}

// Keep the first read's values and only fill in fields it left empty.
function mergeBeans(first, second) {
  const merged = { ...first };
  for (const field of BEAN_FIELDS) {
    if (!filledValue(merged[field]) && filledValue(second[field])) merged[field] = second[field];
  }
  return merged;
}

// Gemini has been seen appending footnote markers like "[^1] [^2] ..." to values.
function cleanText(value) {
  return value.replace(/\s*\[\^?\d+\]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH).trim();
}

function cleanBean(bean) {
  const cleaned = { ...bean };
  for (const field of BEAN_FIELDS) {
    if (typeof cleaned[field] === "string") cleaned[field] = cleanText(cleaned[field]);
  }
  return cleaned;
}

// When the answer was cut off at the token cap, keep the fields that were finished.
function salvageFields(text) {
  const bean = {};
  for (const field of BEAN_FIELDS) {
    const match = text.match(new RegExp(`"${field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?(?=\\s*[,}]))`));
    if (match) {
      try {
        bean[field] = JSON.parse(match[1]);
      } catch {
        // Skip a value that isn't valid JSON on its own.
      }
      continue;
    }
    // The value that was being written when the answer was cut off has no closing quote.
    const unfinished = text.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`));
    if (unfinished) bean[field] = unfinished[1];
  }
  return Object.keys(bean).length > 0 ? bean : null;
}

function parseBean(text) {
  try {
    const bean = JSON.parse(text);
    return bean && typeof bean === "object" && !Array.isArray(bean) ? cleanBean(bean) : null;
  } catch {
    const salvaged = salvageFields(text);
    return salvaged ? cleanBean(salvaged) : null;
  }
}

async function readLabel(base64, mimeType) {
  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: [
          // Labels have small print, so ask Gemini to read the photo at its highest resolution.
          { type: "image", mime_type: mimeType, data: base64, resolution: "ultra_high" },
          { type: "text", text: PROMPT }
        ],
        response_format: { type: "text", mime_type: "application/json", schema: beanSchema },
        generation_config: { thinking_level: "low", max_output_tokens: MAX_OUTPUT_TOKENS },
        store: false
      })
    }
  );
  const payload = await geminiResponse.json();
  if (!geminiResponse.ok) return { status: geminiResponse.status, error: errorMessage(payload) };
  return { bean: parseBean(interactionText(payload)) };
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

    const first = await readLabel(base64, mimeType);
    if (first.error) return response.status(first.status).json({ error: first.error });

    let { fields: bean, notOnLabel } = labelFields(first.bean ?? {});
    for (let retry = 0; retry < MAX_RETRIES && unexplainedMissing(bean, notOnLabel).length >= RETRY_WHEN_UNEXPLAINED; retry++) {
      try {
        const next = await readLabel(base64, mimeType);
        if (!next.bean) continue;
        const again = labelFields(next.bean);
        bean = mergeBeans(bean, again.fields);
        // A field counts as absent only if every read agreed it isn't on the label.
        notOnLabel = notOnLabel.filter(field => again.notOnLabel.includes(field));
      } catch (error) {
        console.error("Bean photo retry failed", error instanceof Error ? error.message : "unknown error");
      }
    }

    if (missingFields(bean).length === BEAN_FIELDS.length) return response.status(422).json({ error: "사진에서 원두 정보를 찾지 못했어요." });
    return response.status(200).json({ bean });
  } catch (error) {
    console.error("Bean photo recognition failed", error instanceof Error ? error.message : "unknown error");
    return response.status(500).json({ error: "사진을 읽는 중 문제가 생겼어요. 사진을 다시 찍어보세요." });
  }
}
