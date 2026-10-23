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
    origin: { type: "string", description: "원산지 국가명" },
    farm: { type: "string", description: "농장 또는 지역" },
    variety: { type: "string", description: "품종" },
    process: { type: "string", description: "가공 방식" },
    roastery: { type: "string", description: "로스터리 또는 판매처" },
    roasteryNotes: { type: "string", description: "봉투에 적힌 컵노트. 쉼표로 구분" },
    purchased: { type: "number", description: "구매한 원두의 무게(g). 숫자만" },
    roastDate: { type: "string", description: "로스팅 날짜 YYYY-MM-DD. 완전한 날짜가 아니면 생략" },
    price: { type: "number", description: "명시된 구매 가격(원). 숫자만" }
  }
};

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
            { type: "image", mime_type: mimeType, data: base64 },
            {
              type: "text",
              text: "이 사진은 커피 원두 봉투 라벨입니다. 라벨에서 명확히 읽을 수 있는 정보만 추출하세요. 추측하거나 번역해서 보완하지 마세요. 원산지, 농장·지역, 품종, 가공방식, 로스터리, 컵노트, 구매량(g), 로스팅 날짜, 가격(원)을 찾습니다. 결과는 한국어로 작성합니다. origin은 반드시 한국어 국가명(예: Ethiopia는 에티오피아, Panama는 파나마, Colombia는 콜롬비아, Kenya는 케냐)으로 반환하세요. farm은 영문 농장명·지역명을 자연스러운 한국어 음역 또는 통용 한국어 표기로 변환해 반환하세요(예: El Vergel은 엘 베르헬). process는 가능하면 워시드, 내추럴, 허니, 무산소 내추럴, 무산소 워시드 중 하나의 정확한 한국어 버튼명으로 반환하세요. cup note는 한국어 맛 표현을 쉼표로 나눕니다. 단, roastery와 variety는 로스터리·품종의 고유명사이므로 봉투 원문 표기를 유지하세요. 날짜가 연·월·일까지 명확하면 YYYY-MM-DD로 정규화하고, 그렇지 않으면 필드를 생략하세요. 값이 없거나 불확실하면 해당 필드를 생략하세요."
            }
          ],
          response_format: { type: "text", mime_type: "application/json", schema: beanSchema },
          store: false
        })
      }
    );
    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) return response.status(geminiResponse.status).json({ error: errorMessage(payload) });

    const text = interactionText(payload);
    if (!text) return response.status(422).json({ error: "사진에서 원두 정보를 찾지 못했어요." });
    return response.status(200).json({ bean: JSON.parse(text) });
  } catch (error) {
    console.error("Bean photo recognition failed", error instanceof Error ? error.message : "unknown error");
    return response.status(500).json({ error: "사진을 읽는 중 문제가 생겼어요. 사진을 다시 찍어보세요." });
  }
}
