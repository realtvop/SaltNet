import { B50_RENDER_SIZE, B50RenderImage } from "../../../shared/rendering/b50-image";
import {
    B50_FONT_FAMILIES,
    B50_RENDER_LANG,
    loadB50RenderFonts,
} from "../../../shared/rendering/b50-fonts";
import type { B50RenderPayload } from "../../../shared/rendering/b50-payload";

export async function renderB50WithTakumi(payload: B50RenderPayload): Promise<Blob> {
    const { render } = await import("takumi-js");
    const fonts = await loadB50RenderFonts();
    const png = await render(
        <B50RenderImage payload={payload} options={{ siteOrigin: window.location.origin }} />,
        {
            ...B50_RENDER_SIZE,
            format: "png",
            fonts,
            fontFamilies: B50_FONT_FAMILIES,
            lang: B50_RENDER_LANG,
        }
    );

    return new Blob([png], { type: "image/png" });
}
