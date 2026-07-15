import { handleRenderRequest } from "./http.js";
import type { RenderEnv } from "./env.js";

export default {
    fetch(request: Request, env: RenderEnv): Promise<Response> {
        return handleRenderRequest({ request, env });
    },
};
