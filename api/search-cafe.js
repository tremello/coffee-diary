// Cafe search for brews drunk at a cafe: Kakao Local keyword search, limited to cafes (CE7).
const KAKAO_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const MAX_QUERY_LENGTH = 60;
// Same publishable project credentials as src/supabase.ts; only used to verify the caller's login.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ghpiixyzxeqvdkwostcb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_dbXp4bFaIdFgjjKP6vUsOg_kd9Ss5g3";

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

const coordinate = (value, limit) => {
  const number = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};

// Only what the app keeps of a place; Kakao's x/y are longitude/latitude strings.
function toCafe(place) {
  const distance = Number(place.distance);
  return {
    placeId: String(place.id ?? ""),
    name: String(place.place_name ?? ""),
    address: String(place.road_address_name || place.address_name || ""),
    lat: Number(place.y),
    lng: Number(place.x),
    ...(place.distance !== undefined && place.distance !== "" && Number.isFinite(distance) ? { distance } : {}),
    mapUrl: String(place.place_url ?? "")
  };
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
  if (!user) return response.status(401).json({ error: "카페 검색은 Google 로그인 후 사용할 수 있어요.", code: "LOGIN_REQUIRED" });

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return response.status(503).json({ error: "카페 검색이 아직 준비되지 않았어요.", code: "KAKAO_KEY_MISSING" });
  }

  try {
    const body = getBody(request);
    const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : "";
    if (!query) return response.status(400).json({ error: "검색어를 입력해주세요." });
    const lat = coordinate(body.lat, 90);
    const lng = coordinate(body.lng, 180);

    const params = new URLSearchParams({ query, category_group_code: "CE7", size: "15" });
    if (lat !== null && lng !== null) {
      params.set("x", String(lng));
      params.set("y", String(lat));
      params.set("radius", "20000");
      params.set("sort", "distance");
    }
    const kakaoResponse = await fetch(`${KAKAO_SEARCH_URL}?${params}`, { headers: { Authorization: `KakaoAK ${key}` } });
    const payload = await kakaoResponse.json().catch(() => ({}));
    if (!kakaoResponse.ok) {
      console.error("Kakao search failed", kakaoResponse.status, payload?.errorType ?? "");
      return response.status(502).json({ error: "카페를 찾는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.", code: "KAKAO_ERROR" });
    }
    const cafes = (Array.isArray(payload.documents) ? payload.documents : []).map(toCafe).filter(cafe => cafe.name);
    return response.status(200).json({ cafes });
  } catch (error) {
    console.error("Cafe search failed", error instanceof Error ? error.message : "unknown error");
    return response.status(500).json({ error: "카페를 찾는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." });
  }
}
