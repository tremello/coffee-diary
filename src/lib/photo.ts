export const PHOTO_ORIGIN_LABELS: Record<string, string> = {
  ethiopia: "에티오피아", panama: "파나마", colombia: "콜롬비아", kenya: "케냐",
  guatemala: "과테말라", peru: "페루", "costa rica": "코스타리카", costarica: "코스타리카"
};

export const PHOTO_PROCESS_LABELS: Record<string, string> = {
  washed: "워시드", natural: "내추럴", honey: "허니", "anaerobic natural": "무산소 내추럴",
  "anaerobic washed": "무산소 워시드", "anaerobic fermentation natural": "무산소 내추럴",
  "anaerobic fermentation washed": "무산소 워시드"
};

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

// Some browsers leave HEIC files without a type, so fall back to the file name.
export const photoMimeType = (file: File) => {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "heic" ? "image/heic" : extension === "heif" ? "image/heif" : "";
};

// The error to show for a photo that can't be sent, or "" when it can.
export const photoProblem = (file: File) => !PHOTO_TYPES.has(photoMimeType(file)) ? "JPG, PNG, WebP, HEIC 사진만 선택할 수 있어요." : file.size > MAX_PHOTO_SELECT_BYTES ? "사진은 25MB 이하로 선택해주세요." : "";

// Vercel rejects request bodies over 4.5MB, so photos are shrunk to a JPEG well under that before upload.
export const MAX_PHOTO_SELECT_BYTES = 25 * 1024 * 1024;

const MAX_PHOTO_UPLOAD_BYTES = 3 * 1024 * 1024;

const PHOTO_MAX_SIDE = 1800;

const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("사진을 읽지 못했어요."));
  reader.onerror = () => reject(new Error("사진을 읽지 못했어요."));
  reader.readAsDataURL(blob);
});

const shrinkPhoto = async (file: File): Promise<Blob | null> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
};

export const preparePhoto = async (file: File, mimeType: string) => {
  const shrunk = await shrinkPhoto(file);
  if (shrunk && shrunk.size <= MAX_PHOTO_UPLOAD_BYTES) return { image: await readAsDataUrl(shrunk), mimeType: "image/jpeg" };
  // Browsers that cannot decode the file (e.g. HEIC outside Safari) send the original when it is small enough.
  if (file.size <= MAX_PHOTO_UPLOAD_BYTES) return { image: await readAsDataUrl(file), mimeType };
  throw new Error("이 브라우저에서는 사진 크기를 줄일 수 없어요. 3MB 이하 사진이나 JPG로 다시 선택해주세요.");
};

export const localizedPhotoField = (value: string, labels: Record<string, string>) => labels[value.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ")] ?? value.trim();

// Where a photo read is, for the small progress bar in the bean and recipe sheets.
// Only the upload has a real percentage; preparing and reading show a moving bar.
export type PhotoStep = { stage: "prepare" | "upload" | "read"; sent: number };

const PHOTO_READ_TIMEOUT_MS = 60_000;

// POSTs a prepared photo and reports when it is sent, so the sheet can say "보내는 중" then "읽는 중".
// Uses XMLHttpRequest because fetch cannot report upload progress.
export const sendPhoto = (url: string, token: string, body: unknown, onStep: (step: PhotoStep) => void) => new Promise<{ ok: boolean; payload: Record<string, unknown> }>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", url);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  xhr.timeout = PHOTO_READ_TIMEOUT_MS;
  // Some browsers report no upload progress at all; then "읽는 중" follows after a short while instead of sitting at 0%.
  let sending = true;
  const sent = () => { if (sending) { sending = false; window.clearTimeout(quiet); onStep({ stage: "read", sent: 1 }); } };
  const quiet = window.setTimeout(sent, 2500);
  xhr.upload.onprogress = event => {
    if (!sending || !event.lengthComputable || event.total <= 0) return;
    window.clearTimeout(quiet);
    onStep({ stage: "upload", sent: Math.min(1, event.loaded / event.total) });
  };
  xhr.upload.onload = sent;
  xhr.onloadend = () => window.clearTimeout(quiet);
  xhr.onload = () => {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(xhr.responseText) ?? {}; } catch { /* not JSON: keep the default message */ }
    resolve({ ok: xhr.status >= 200 && xhr.status < 300, payload });
  };
  xhr.onerror = () => reject(new Error("인터넷 연결이 끊겼어요. 연결을 확인하고 다시 읽어주세요."));
  xhr.ontimeout = () => reject(new Error("읽는 데 너무 오래 걸렸어요. 잠시 뒤 다시 읽어주세요."));
  onStep({ stage: "upload", sent: 0 });
  xhr.send(JSON.stringify(body));
});
