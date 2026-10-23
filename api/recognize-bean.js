const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

function getBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

function errorMessage(payload) {
  return payload?.error?.message || "Gemini가 사진을 읽지 못했어요. 잠시 후 다시 시도해주세요.";
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 사용할 수 있어요." });
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
      return response.status(413).json({ error: "사진은 6MB 이하로 선택해주세요." });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "이 사진은 커피 원두 봉투 라벨입니다. 라벨에서 명확히 읽을 수 있는 정보만 추출하세요. 추측하거나 번역해서 보완하지 마세요. 원산지, 농장·지역, 품종, 가공방식, 로스터리, 컵노트, 구매량(g), 로스팅 날짜, 가격(원)을 찾습니다. 컵노트는 쉼표로 나눕니다. 날짜가 연·월·일까지 명확하면 YYYY-MM-DD로 정규화하고, 그렇지 않으면 필드를 생략하세요. 값이 없거나 불확실하면 해당 필드를 생략하세요."
              },
              { inlineData: { mimeType, data: base64 } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: beanSchema,
            temperature: 0
          }
        })
      }
    );
    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) return response.status(geminiResponse.status).json({ error: errorMessage(payload) });

    const text = payload?.candidates?.[0]?.content?.parts?.find(part => typeof part.text === "string")?.text;
    if (!text) return response.status(422).json({ error: "사진에서 원두 정보를 찾지 못했어요." });
    return response.status(200).json({ bean: JSON.parse(text) });
  } catch (error) {
    console.error("Bean photo recognition failed", error instanceof Error ? error.message : "unknown error");
    return response.status(500).json({ error: "사진을 읽는 중 문제가 생겼어요. 사진을 다시 찍어보세요." });
  }
}
