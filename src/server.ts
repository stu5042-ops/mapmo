import handler from "@tanstack/react-start/server-entry";
import { handleApi, type Env } from "./server-api";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const apiResponse = await handleApi(request, env);
      if (apiResponse) return apiResponse;
      return await handler.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response(
        "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>메모맵</title><style>body{font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#111}.card{max-width:28rem;text-align:center;padding:2rem}button,a{display:inline-block;padding:.6rem 1rem;margin:.25rem;border:1px solid #ddd;background:#fff;color:#111;text-decoration:none;cursor:pointer}</style></head><body><div class=\"card\"><h1>페이지를 불러오지 못했어요</h1><p>잠시 후 다시 시도해주세요.</p><button onclick=\"location.reload()\">다시 시도</button><a href=\"/\">홈으로</a></div></body></html>",
        { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  },
};
