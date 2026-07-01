import { B50_RENDER_SIZE, renderB50Html } from "../../../shared/rendering/b50-template";
import type { B50RenderPayload } from "../../../shared/rendering/b50-payload";

const B50_RENDER_FONTS = [
    "https://fonts.gstatic.com/s/notosanssc/v39/k3kJo84MPvpLmixcA63oeALZTYKL2wv287Sb.otf",
    "https://fonts.gstatic.com/s/notosansjp/v55/-F6jfjtqLzI2JPCgQBnw7HFQoggM-FNthvIU.otf",
    "https://fonts.gstatic.com/s/notosanstc/v38/-nF7OG829Oofr2wohFbTp9i9WyEJIfNZ1g.woff2",
];

export async function renderB50WithTakumi(payload: B50RenderPayload): Promise<Blob> {
    const { render } = await import("takumi-js");
    const png = await render(renderB50Html(payload, { siteOrigin: window.location.origin }), {
        ...B50_RENDER_SIZE,
        format: "png",
        fonts: B50_RENDER_FONTS,
    });

    return new Blob([png], { type: "image/png" });
}
